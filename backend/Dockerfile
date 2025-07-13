FROM public.ecr.aws/lambda/python:3.12
# The AWS Lambda Python base image uses Debian/Ubuntu, so use apt-get instead of yum
RUN apt-get update && apt-get install -y libpq-dev
# Copy function code
COPY database.py ${LAMBDA_TASK_ROOT}
COPY main.py ${LAMBDA_TASK_ROOT}
COPY routes/invoice_routes.py ${LAMBDA_TASK_ROOT}/routes
COPY routes/customer_routes.py ${LAMBDA_TASK_ROOT}/routes
COPY models.py ${LAMBDA_TASK_ROOT}

# Install the function's dependencies using file requirements.txt
# from your project folder.
COPY requirements.txt .
RUN pip install -r requirements.txt --target "${LAMBDA_TASK_ROOT}" -U --no-cache-dir
# Set the CMD to your handler (could also be done as a parameter override outside of the Dockerfile)
CMD [ "main.handler" ]
