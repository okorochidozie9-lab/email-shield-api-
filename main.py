from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse
import pdfplumber
import camelot
import tabula
import pytesseract
import pandas as pd
from io import BytesIO
import re
from dateutil import parser as date_parser

app = FastAPI(title="Receipt Cleanup API", version="2.0")

def extract_with_pdfplumber(pdf_path):
    dfs = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            table = page.extract_table()
            if table:
                dfs.append(pd.DataFrame(table[1:], columns=table[0]))
    return pd.concat(dfs, ignore_index=True) if dfs else pd.DataFrame()

def extract_with_camelot(pdf_path):
    try:
        tables = camelot.read_pdf(pdf_path, pages='all', flavor='lattice')
        if tables.n == 0:
            tables = camelot.read_pdf(pdf_path, pages='all', flavor='stream')
        return pd.concat([t.df for t in tables]) if tables.n > 0 else pd.DataFrame()
    except:
        return pd.DataFrame()

def extract_with_tabula(pdf_path):
    try:
        dfs = tabula.read_pdf(pdf_path, pages='all', multiple_tables=True)
        return pd.concat(dfs, ignore_index=True) if dfs else pd.DataFrame()
    except:
        return pd.DataFrame()

def extract_with_ocr(pdf_path):
    # Simple OCR fallback for scanned PDFs
    dfs = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            img = page.to_image(resolution=300).original
            text = pytesseract.image_to_string(img)
            # crude line split - improve with regex later
            lines = [l.split() for l in text.split('\n') if l.strip()]
            if lines:
                dfs.append(pd.DataFrame(lines))
    return pd.concat(dfs, ignore_index=True) if dfs else pd.DataFrame()

def normalize_df(df):
    if df.empty:
        return df
    # Auto-detect columns
    df.columns = [str(c).lower().strip() for c in df.columns]
    col_map = {}
    for col in df.columns:
        if re.search(r'date', col):
            col_map[col] = 'date'
        elif re.search(r'vendor|merchant|desc', col):
            col_map[col] = 'vendor'
        elif re.search(r'amount|debit|credit', col):
            col_map[col] = 'amount'
    df = df.rename(columns=col_map)

    # Clean amount
    if 'amount' in df.columns:
        df['amount'] = df['amount'].astype(str).str.replace(r'[^\d.-]', '', regex=True)
        df['amount'] = pd.to_numeric(df['amount'], errors='coerce')

    # Parse date
    if 'date' in df.columns:
        df['date'] = df['date'].apply(lambda x: date_parser.parse(str(x)).date() if pd.notna(x) else None)

    confidence = 0.95 if 'amount' in df.columns and df['amount'].notna().mean() > 0.8 else 0.6
    return df, confidence

@app.post("/cleanup")
async def cleanup(file: UploadFile = File(...)):
    if not file.filename.endswith(('.pdf', '.csv', '.xlsx')):
        raise HTTPException(400, "Only PDF, CSV, XLSX supported")

    contents = await file.read()
    temp_path = "/tmp/upload.pdf"
    with open(temp_path, "wb") as f:
        f.write(contents)

    # Multi-engine extraction with fallback
    df = extract_with_camelot(temp_path)
    method = "camelot"
    if df.empty or len(df) < 3:
        df = extract_with_tabula(temp_path)
        method = "tabula"
    if df.empty or len(df) < 3:
        df = extract_with_pdfplumber(temp_path)
        method = "pdfplumber"
    if df.empty or len(df) < 3:
        df = extract_with_ocr(temp_path)
        method = "ocr"

    df, confidence = normalize_df(df)

    if df.empty:
        raise HTTPException(422, "No table found in PDF")

    transactions = df.to_dict(orient='records')

    return {
        "status": "success",
        "method": method,
        "confidence": round(confidence, 2),
        "count": len(transactions),
        "transactions": transactions[:500], # limit response size
        "csv_download": "/download_csv" # implement if needed
    }

@app.get("/")
def health():
    return {"status": "ok", "version": "2.0"}
