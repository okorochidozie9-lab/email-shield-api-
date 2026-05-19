# Receipt Cleanup API

Convert messy bank statements, receipts, and invoices from PDF, CSV, and XLSX into clean JSON. 
Built for accountants, bookkeepers, and SaaS apps that need clean transaction data fast.

## Features
- Extract tables from PDFs using pdfplumber
- Auto-detect date, vendor, amount columns
- Normalize vendor names and categorize transactions
- Handle negatives, currency symbols, and messy formats
- 10MB file limit per request

## Endpoint
`POST /cleanup`
Upload a file with form-data key `file`.

## Example Response
```json
{
  "status": "success",
  "transactions": [
    {
      "date": "2024-10-01",
      "vendor": "Amazon",
      "category": "Office Supplies",
      "description": "AMAZON *12345",
      "amount": 49.99
    }
  ],
  "count": 1
}
