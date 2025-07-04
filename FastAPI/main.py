from fastapi import FastAPI
from database import create_db_and_tables
from fastapi.middleware.cors import CORSMiddleware
from routes import router as invoice_router

app = FastAPI()

@app.on_event("startup")
# Create the database tables if they don't exist when our application starts and i wnat my data to be persistent everytime the application starts(like with the old data also)

def on_startup():
    create_db_and_tables()

app.include_router(invoice_router)

origins = [
    "http://192.168.1.217:3000",       # A different application is allowed to call our FastAPI application only if it is running on localhost:3000
    # when deployed in lambda,   
    "http://191.168.1.192:3000"  ,
    "http://localhost:3000",            # Allow requests from localhost:3000
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,                # Allow only the specified origins
    allow_credentials=True,
    allow_methods=["*"],                  # Allow all HTTP methods
    allow_headers=["*"],                  # Allow all headers
)