# Postgres for Kourti: the official postgres:16-alpine image plus pgvector,
# which document search (RAG embeddings) needs.
#
# Staying on the alpine base keeps the same libc/collation as the original
# postgres:16-alpine image, so existing data volumes need no reindex.
FROM postgres:16-alpine

ARG PGVECTOR_VERSION=0.8.0

# with_llvm=no: skip the optional JIT bitcode (avoids needing the exact clang
# version the base image was built with).
RUN apk add --no-cache --virtual .pgvector-build git build-base \
 && git clone --branch "v${PGVECTOR_VERSION}" --depth 1 https://github.com/pgvector/pgvector.git /tmp/pgvector \
 && make -C /tmp/pgvector OPTFLAGS="" with_llvm=no \
 && make -C /tmp/pgvector with_llvm=no install \
 && rm -rf /tmp/pgvector \
 && apk del .pgvector-build
