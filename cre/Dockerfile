FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      curl ca-certificates bash jq unzip && \
    rm -rf /var/lib/apt/lists/*

# Install Bun (needed for workflow dependency install & cre-setup postinstall)
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

# Install CRE CLI (requires glibc >= 2.39, Ubuntu 24.04 provides it)
RUN curl -sSL https://cre.chain.link/install.sh | bash && \
    ln -sf "$HOME/.cre/bin/cre" /usr/local/bin/cre
ENV PATH="/root/.cre/bin:${PATH}"

WORKDIR /app

COPY project.yaml ./
COPY secrets.yaml ./
COPY dca-workflow/ ./dca-workflow/

# Install workflow dependencies (SDK, viem, zod + Javy plugin)
WORKDIR /app/dca-workflow
RUN bun install
WORKDIR /app

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
