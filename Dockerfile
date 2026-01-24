FROM ghcr.io/foundry-rs/foundry:v1.6.0-rc1

ENV ANVIL_FORK_URL="" \
    ANVIL_FORK_BLOCK_NUMBER=""

ENTRYPOINT ["anvil", "--host", "0.0.0.0"]
