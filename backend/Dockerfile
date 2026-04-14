FROM public.ecr.aws/lambda/python:3.12

# Install Python dependencies into Lambda task root
COPY requirements.txt .
RUN pip install -r requirements.txt --target "${LAMBDA_TASK_ROOT}" --no-cache-dir

# Copy all application code
COPY main.py database.py models.py exceptions.py api.py ${LAMBDA_TASK_ROOT}/
COPY routes/ ${LAMBDA_TASK_ROOT}/routes/
COPY services/ ${LAMBDA_TASK_ROOT}/services/
COPY middleware/ ${LAMBDA_TASK_ROOT}/middleware/

CMD ["main.handler"]
