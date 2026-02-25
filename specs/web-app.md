# Web App Spec (Stub)

Status: Planned

## To Define
- Strategy create/edit flows
- Data contract with backend/CRE boundary
- Auth and access model
- Error and loading states

## Current Implemented Test Flow
- Page: `web/src/app/page.tsx`
- User action: click "Run CRE simulation"
- Request: `POST /api/cre/simulate`
- Response: JSON payload with command, duration, stdout, stderr, and exit status
