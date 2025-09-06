# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an Invoice Management System (IMS) with a React frontend and FastAPI backend deployed on AWS using the Serverless Framework.

## Architecture

### Backend (`/backend/`)
- **FastAPI** application with **SQLModel** for database operations
- **PostgreSQL** database with SQLite fallback for development
- **AWS Lambda** deployment via Serverless Framework
- **Pydantic** models for request/response validation
- Modular route structure in `/routes/` directory

### Frontend (`/frontend/invoicemanagement-app/`)
- **React** application (Create React App)
- **React Router** for navigation
- **Axios** for API communication
- Component-based architecture with separate CSS files

### Key Models
- **Invoice**: Main invoice entity with line items and customer relationships
- **LineItem**: Individual invoice line items with product references
- **Customer**: Customer information and invoice history
- **Product**: Product catalog with descriptions and pricing

## Development Commands

### Frontend Development
```bash
cd frontend/invoicemanagement-app
npm install          # Install dependencies
npm start           # Start development server (http://localhost:3000)
npm test            # Run test runner
npm run build       # Build for production
```

### Backend Development
```bash
cd backend
pip install -r requirements.txt  # Install Python dependencies
python -m uvicorn api:app --reload  # Run FastAPI development server (port 8000)
```

### Backend Deployment
```bash
cd backend
aws configure       # Configure AWS credentials (never commit credentials)
serverless deploy   # Deploy to AWS Lambda
```

## API Configuration

The frontend is configured to connect to `http://localhost:8000` for local development (see `frontend/invoicemanagement-app/src/api.js`).

## Database

- Uses SQLite (`database.db`) for local development
- PostgreSQL support configured via `psycopg2-binary` for production
- Database models defined in `models.py` with SQLModel
- Validation schemas in `api.py` using Pydantic

## Route Structure

- `/invoice` - Invoice creation and editing
- `/invoices` - All invoices listing
- `/customer` - Customer management
- `/product` - Product catalog management
- `/invoice/:id` - Single invoice view

## Important Notes

- Auto-complete customer search has two implementation approaches documented in frontend README:
  1. Load all customer data to frontend with client-side filtering
  2. Server-side search API with debounce (recommended for large datasets)
- AWS credentials should never be committed - use `aws configure` locally
- The system supports both draft and finalized invoice statuses