# Receipt Cleanup API

Turn messy bank statements, receipts, and invoices into clean, structured transaction data in seconds.
Built for accountants, bookkeepers, and SaaS apps that need accurate data without manual cleanup.

## What it does
- Extracts tables from PDFs, CSVs, and XLSX files automatically
- Handles scanned PDFs with built-in OCR fallback
- Auto-detects date, vendor, amount, and description columns
- Normalizes vendor names, currency symbols, and negative values
- Returns both JSON and a confidence score so you know when to review
- Processes files up to 10MB per request

## Endpoint
`POST /cleanup`  
Send your file as `form-data` with the key `file`.

## Example Request
```bash
curl -X POST "https://your-domain.com/cleanup" \
  -F "file=@statement.pdf"
{
  "status": "success",
  "method": "lattice",
  "confidence": 0.96,
  "count": 42,
  "transactions": [
    {
      "date": "2024-10-01",
      "vendor": "Amazon",
      "category": "Office Supplies",
      "description": "AMAZON *12345",
      "amount": 49.99
    }
  ]
}
