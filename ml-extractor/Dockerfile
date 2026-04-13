FROM public.ecr.aws/lambda/python:3.12

# Install gcc needed by some ML deps
RUN yum install -y gcc && yum clean all

# Bake model into image so cold start has no network download
ENV SENTENCE_TRANSFORMERS_HOME=/var/task/.model_cache
ENV TRANSFORMERS_CACHE=/var/task/.model_cache
ENV HF_HOME=/var/task/.model_cache

# Install dependencies
COPY requirements.txt .
RUN pip install -r requirements.txt --target "${LAMBDA_TASK_ROOT}" -U --no-cache-dir

# Copy source files
COPY semantic_matcher.py ${LAMBDA_TASK_ROOT}/
COPY pdf_processor.py    ${LAMBDA_TASK_ROOT}/
COPY app.py              ${LAMBDA_TASK_ROOT}/

# Pre-download all-MiniLM-L6-v2 (~80MB) during image build
# This avoids any network call at runtime (cold start safe)
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2')"

CMD ["app.handler"]
