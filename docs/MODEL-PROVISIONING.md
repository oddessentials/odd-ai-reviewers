# Model Provisioning Guide

## Overview

This guide provides strategies for provisioning Ollama models in various deployment scenarios, including air-gapped environments.

> **Note for OSCR Users:** When running odd-ai-reviewers inside [OSCR](https://github.com/oddessentials/odd-self-hosted-ci-runtime), model provisioning is handled by the OSCR host operator. See the OSCR repository for OSCR-specific deployment patterns.

## General Provisioning Strategies

## Strategy 1: Docker Volume Transfer (Recommended)

Use a Docker volume to store models, populated in a staging environment with internet access, then transferred to production.

### Setup

1. **Staging environment** (with internet access):

   ```bash
   # Run Ollama and pull models
   docker run -d --name ollama-staging \
     -v ollama-models:/root/.ollama/models \
     ollama/ollama:latest

   # Wait for service to start
   sleep 10

   # Pull required models
   docker exec ollama-staging ollama pull codellama:7b
   docker exec ollama-staging ollama pull deepseek-coder-v2:16b

   # Stop container
   docker stop ollama-staging
   docker rm ollama-staging
   ```

2. **Export model volume**:

   ```bash
   docker run --rm \
     -v ollama-models:/models \
     -v $(pwd):/backup \
     alpine tar czf /backup/ollama-models.tar.gz -C /models .
   ```

3. **Transfer to production**:

   ```bash
   # Copy ollama-models.tar.gz to production system
   scp ollama-models.tar.gz user@production-host:/path/to/import/
   ```

4. **Import on production**:

   ```bash
   # On production system
   docker volume create ollama-models
   docker run --rm \
     -v ollama-models:/models \
     -v /path/to/import:/backup \
     alpine tar xzf /backup/ollama-models.tar.gz -C /models
   ```

5. **Use in your deployment**:
   ```bash
   # Mount the volume when running Ollama
   docker run -d \
     -v ollama-models:/root/.ollama/models \
     -p 11434:11434 \
     ollama/ollama:latest
   ```

## Strategy 2: Baked Docker Image

Pre-bake models into a custom Ollama image.

### Build Custom Image

Create `Dockerfile.ollama-preloaded`:

```dockerfile
FROM ollama/ollama:latest

# Start Ollama server in background
RUN ollama serve & sleep 10 && \
    # Pull required models
    ollama pull codellama:7b && \
    ollama pull deepseek-coder-v2:16b && \
    # Stop server
    pkill ollama

# Set default model
ENV OLLAMA_MODEL=codellama:7b
```

### Build and Push

```bash
# Build custom image
docker build -f Dockerfile.ollama-preloaded -t my-org/ollama-preloaded:latest .

# Push to private registry (accessible from production)
docker push my-org/ollama-preloaded:latest
```

### Use Preloaded Image

```yaml
# In your deployment configuration
services:
  ollama:
    image: my-org/ollama-preloaded:latest
```

### Pros and Cons

**Pros:**

- No volume transfer needed
- Self-contained deployment
- Faster startup (no model download)

**Cons:**

- Larger image size (3-8GB)
- Requires private Docker registry
- Model updates require image rebuild

## Strategy 3: External Cache Volume

Pre-populate volume on external system, then transfer.

### On Internet-Connected System

```bash
# Create and populate volume
docker run -d --name ollama-temp \
  -v ollama-models-transfer:/root/.ollama/models \
  ollama/ollama:latest

# Wait for service to start
sleep 10

# Pull models
docker exec ollama-temp ollama pull codellama:7b
docker exec ollama-temp ollama pull deepseek-coder-v2:16b

# Stop and remove container
docker stop ollama-temp
docker rm ollama-temp

# Export volume
docker run --rm \
  -v ollama-models-transfer:/models \
  -v $(pwd):/backup \
  alpine tar czf /backup/ollama-models.tar.gz -C /models .

# Cleanup
docker volume rm ollama-models-transfer
```

### Transfer to Air-Gapped System

```bash
# Copy to production
scp ollama-models.tar.gz user@production:/import/

# On production
do docker volume create ollama-models
docker run --rm \
  -v ollama-models:/models \
  -v /import:/backup \
  alpine tar xzf /backup/ollama-models.tar.gz -C /models
```

## Strategy 4: Manual Model Transfer

For highly restricted environments, manually transfer model files.

### Download Models

On internet-connected system:

```bash
# Create temporary container
docker run -d --name ollama-download ollama/ollama:latest
sleep 10

# Pull model
docker exec ollama-download ollama pull codellama:7b

# Copy model files
docker cp ollama-download:/root/.ollama/models ./models-export/

# Cleanup
docker stop ollama-download
docker rm ollama-download
```

### Transfer and Import

```bash
# Copy to production
rsync -avz ./models-export/ user@production:/models-import/

# On production
docker run --rm \
  -v ollama-models:/models \
  -v /models-import:/import \
  alpine sh -c "cp -r /import/* /models/"
```

## Model Update Procedures

### Update Models

1. Pull new model in staging:

   ```bash
   docker run --rm \
     -v ollama-models:/root/.ollama/models \
     ollama/ollama:latest \
     ollama pull qwen2.5-coder:14b
   ```

2. Test new model:

   ```bash
   # Update OLLAMA_MODEL environment variable in your deployment
   # Restart Ollama service
   ```

3. Export updated volume:
   ```bash
   docker run --rm \
     -v ollama-models:/models \
     -v $(pwd):/backup \
     alpine tar czf /backup/ollama-models-updated.tar.gz -C /models .
   ```

### Deploy Updated Models

1. Transfer new model archive to production

2. Backup current models:

   ```bash
   docker run --rm \
     -v ollama-models:/models \
     -v $(pwd):/backup \
     alpine tar czf /backup/ollama-models-backup-$(date +%Y%m%d).tar.gz -C /models .
   ```

3. Import new models:

   ```bash
   docker run --rm \
     -v ollama-models:/models \
     -v $(pwd):/backup \
     alpine sh -c "rm -rf /models/* && tar xzf /backup/ollama-models-updated.tar.gz -C /models"
   ```

4. Restart your Ollama service

## Verification

### Check Model Availability

```bash
# List models in volume
docker run --rm \
  -v ollama-models:/models \
  alpine ls -lh /models/blobs

# Check model manifest
docker run --rm \
  -v ollama-models:/models \
  alpine cat /models/manifests/registry.ollama.ai/library/codellama/7b
```

### Test Model Inference

```bash
# Start temporary Ollama container with models
docker run --rm -it \
  -v ollama-models:/root/.ollama/models \
  ollama/ollama:latest \
  ollama run codellama:7b "Hello, test prompt"
```

## Model Size Reference

| Model                   | Disk Size | RAM Required |
| ----------------------- | --------- | ------------ |
| `codellama:7b`          | ~3.8GB    | 4GB          |
| `deepseek-coder-v2:16b` | ~9GB      | 8GB          |
| `qwen2.5-coder:7b`      | ~4.2GB    | 4GB          |
| `qwen2.5-coder:14b`     | ~8.5GB    | 8GB          |

## Troubleshooting

### Model Not Found Error

**Problem:** Router reports "model not found"

**Diagnosis:**

```bash
docker run --rm \
  -v ollama-models:/models \
  alpine ls -R /models
```

**Solution:** Re-run model provisioning for the specific model

### Insufficient Disk Space

**Problem:** Volume runs out of space during provisioning

**Solution:**

1. Check volume size: `docker system df -v`
2. Provision one model at a time
3. Clean up unused models: `docker exec ollama rm <model-name>`

### Corrupted Model Files

**Problem:** Ollama fails to load model

**Solution:**

1. Delete corrupted volume
2. Re-provision from scratch
3. Verify checksum of transferred archive
