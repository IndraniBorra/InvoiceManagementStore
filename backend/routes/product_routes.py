from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select, update
from database import get_session, engine
from typing import List
import models
from models import Product
from api import ProductRequest, ProductMinimalResponse

router = APIRouter()
models.SQLModel.metadata.create_all(bind=engine)


# Product Routes

# Create a new product
@router.post('/product', response_model=ProductMinimalResponse)
def create_product(product: ProductRequest, session: Session = Depends(get_session)):

    existing_product = session.exec(select(Product).where(Product.product_description == product.product_description)).one_or_none()
    if existing_product:
        raise HTTPException(status_code=400, detail="Product already exists")

    product_db = Product.model_validate(product)
    session.add(product_db)
    session.commit()
    session.refresh(product_db)
    return ProductMinimalResponse(
        **product_db.model_dump()
    )

# Get all products
@router.get('/products', response_model=List[ProductMinimalResponse])
def get_products(session: Session = Depends(get_session)):
    products = session.exec(select(Product)).all()
    print("Session started for all products retrieval")
    return [
        ProductMinimalResponse(
            **product.model_dump()
        ) for product in products
    ]

# update an existing product
@router.put('/product/{product_id}', response_model=ProductMinimalResponse)
def update_product(product_id: int, product: ProductRequest, session: Session = Depends(get_session)):
    product_request_dict = product.model_dump()
    product_db = session.exec(select(Product).where(Product.product_id == product_id)).one_or_none()
    if not product_db:
        raise HTTPException(status_code=404, detail="Product not found")
    existing_product = session.exec(select(Product).where(Product.product_description == product_request_dict.get('product_description'))).one_or_none()
    if existing_product and existing_product.product_id != product_id:
        raise HTTPException(status_code=400, detail="Product description must be unique")
    

    for field, value in product_request_dict.items():
        setattr(product_db, field, value)


    session.add(product_db)
    session.commit()
    session.refresh(product_db)
    return ProductMinimalResponse(
        **product_db.model_dump()
    )

# Delete a product
@router.delete('/product/{product_id}', response_model=ProductMinimalResponse)
def delete_product(product_id: int, session: Session = Depends(get_session)):
    product_db = session.get(Product, product_id)
    if not product_db:
        raise HTTPException(status_code=404, detail="Product not found")

    session.delete(product_db)
    session.commit()
    return ProductMinimalResponse(
        **{"deleted": True, "id": product_id, "message": "Product deleted successfully"}
    )
