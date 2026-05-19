from fastapi import FastAPI, File, UploadFile, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
import pdfplumber
import pandas as pd
import re
from dateutil import parser as date_parser
from io import BytesIO

app = FastAPI(title="Receipt Cleanup API", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB limit

# Simple vendor category map - expand this as you get real data
CATEGORY_MAP = {
    "AMAZON": "Office Supplies",
    "AMZN": "Office Supplies",
    "WALMART": "Supplies",
    "TARGET": "Supplies",
    "STARBUCKS": "Meals",
    "UBER": "Travel",
    "LYFT": "Travel",
    "ADOBE": "Software",
    "GOOGLE": "Software",
    "MICROSOFT": "Software",
    "STRIPE": "Bank Fees",
    "PAYPAL": "Bank Fees",
}

@app.middleware("http")
async def check_rapidapi_key(request: Request, call_next):
    """Ensure request has RapidAPI key. RapidAPI validates it for you."""
    if request.url.path in ["/health", "/docs", "/openapi.json"]:
        return await call_next(request)
    
    rapidapi_key = request.headers.get("x-rapidapi-key")
    if not rapidapi_key:
        raise HTTPException(status_code=401, detail="Missing API key")
    
    response = await call_next(request)
    return response

def clean_vendor(name: str) -> str:
    """Normalize vendor names"""
    if not name:
        return "Unknown"
    
    name = str(name).upper().strip()
    # Remove common junk like *12345 or #ABC
    name = re.sub(r'\*[\d\w]+', '', name)
    name = re.sub(r'#[\d\w]+', '', name)
    name = re.sub(r'\s+', ' ', name).strip()
    
    # Map to clean name
    for key in CATEGORY_MAP:
        if key in name:
            return key.title()
    
    return name.title()

def clean_amount(amount) -> float:
    """Convert amount to float, handle $ and () for negatives"""
    if pd.isna(amount):
        return 0.0
    
    s = str(amount).strip()
    is_negative = s.startswith(') and s.endswith(')')
    s = re.sub(r'[\$,()]', '', s)
    
    try:
        val = float(s)
        return -val if is_negative else val
    except:
        return 0.0

def clean_date(date_str) -> str:
    """Normalize date to YYYY-MM-DD"""
    if pd.isna(date_str) or not date_str:
        return None
    
    try:
        dt = date_parser.parse(str(date_str), fuzzy=True, dayfirst=False)
        return dt.strftime('%Y-%m-%d')
    except:
        return None

def categorize_vendor(vendor: str) -> str:
    """Map vendor to category"""
    vendor_upper = vendor.upper()
    for key, cat in CATEGORY_MAP.items():
        if key in vendor_upper:
            return cat
    return "Uncategorized"

def extract_from_pdf(file) -> pd.DataFrame:
    """Extract tables from PDF"""
    rows = []
    with pdfplumber.open(file) as pdf:
        for page in pdf.pages:
            tables = page.extract_tables()
            for table in tables:
                if table:
                    rows.extend([row for row in table if row and any(row)])
    
    if not rows:
        raise ValueError("No tables found in PDF")
    
    # Assume first row is header
    df = pd.DataFrame(rows[1:], columns=rows[0])
    return df

def extract_from_csv(file, filename: str) -> pd.DataFrame:
    """Extract from CSV/XLSX"""
    if filename.endswith('.xlsx'):
        return pd.read_excel(file)
    return pd.read_csv(file)

def normalize_dataframe(df: pd.DataFrame) -> list:
    """Clean and normalize the dataframe"""
    # Auto-detect columns
    cols = {c.lower().strip(): c for c in df.columns}
    
    date_col = next((cols[k] for k in cols if 'date' in k), df.columns[0])
    desc_col = next((cols[k] for k in cols if any(x in k for x in ['desc', 'vendor', 'name', 'merchant'])), df.columns[1])
    amt_col = next((cols[k] for k in cols if any(x in k for x in ['amount', 'amt', 'total', 'value'])), df.columns[-1])
    
    cleaned = []
    for _, row in df.iterrows():
        vendor = clean_vendor(row.get(desc_col))
        amount = clean_amount(row.get(amt_col))
        
        if amount != 0:
            cleaned.append({
                "date": clean_date(row.get(date_col)),
                "vendor": vendor,
                "category": categorize_vendor(vendor),
                "description": str(row.get(desc_col)).strip(),
                "amount": amount
            })
    
    return cleaned

@app.post("/cleanup")
async def cleanup_file(file: UploadFile = File(...)):
    """Main endpoint - upload file, get cleaned data"""
    
    # Check file size
    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large. Max 10MB.")
    
    if not file.filename.endswith(('.pdf', '.csv', '.xlsx')):
        raise HTTPException(status_code=400, detail="Only PDF, CSV, XLSX supported")
    
    try:
        file_obj = BytesIO(contents)
        
        if file.filename.endswith('.pdf'):
            df = extract_from_pdf(file_obj)
        else:
            df = extract_from_csv(file_obj, file.filename)
        
        cleaned_data = normalize_dataframe(df)
        
        return {
            "status": "success",
            "transactions": cleaned_data,
            "count": len(cleaned_data)
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")

@app.get("/health")
async def health():
    return {"status": "ok", "version": "1.0"}



