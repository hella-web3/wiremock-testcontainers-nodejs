FROM ghcr.io/foundry-rs/foundry

ENV ANVIL_FORK_URL=""
ENV ANVIL_FORK_BLOCK_NUMBER=""

ENTRYPOINT ["anvil", "--host", "0.0.0.0"]
