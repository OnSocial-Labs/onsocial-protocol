#!/bin/bash

# Get the directory of this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Prompt user for configuration values
read -p "Enter your NEAR account ID (e.g., your_account.testnet): " ACCOUNT_ID
read -p "Enter NEAR environment (testnet/mainnet): " NEAR_ENV
read -p "Enter the number of keys to generate: " KEYS_COUNT

# Set default values if input is empty
NEAR_ENV=${NEAR_ENV:-testnet}
KEYS_COUNT=${KEYS_COUNT:-5}

# Directory and file configuration (always relative to script location)
KEYS_DIR="$SCRIPT_DIR/account_keys"
KEY_FILE="${KEYS_DIR}/${ACCOUNT_ID}.json"
CONFIG_FILE="$SCRIPT_DIR/config.toml"

# Ensure NEAR environment is correctly set
export NEAR_ENV

# Check for FullAccess key using correct NEAR CLI syntax
FULL_ACCESS_KEYS=$(near list-keys "$ACCOUNT_ID" --networkId "$NEAR_ENV" | grep "FullAccess" | wc -l)
if [ "$FULL_ACCESS_KEYS" -eq "0" ]; then
  echo "No FullAccess keys found for account $ACCOUNT_ID. Please add a FullAccess key before continuing."
  exit 1
fi

# Create keys directory if it doesn't exist
mkdir -p "$KEYS_DIR"

# Empty or create the key file
echo "[]" > "$KEY_FILE"

# Generate and add keys
for ((i = 1; i <= KEYS_COUNT; i++)); do
  # Generate a random implicit account ID for key generation
  IMPLICIT_ID=$(openssl rand -hex 32)
  TEMP_CREDENTIALS_FILE="$HOME/.near-credentials/$NEAR_ENV/$IMPLICIT_ID.json"

  # Generate a new keypair for the implicit account
  near generate-key "$IMPLICIT_ID" --networkId "$NEAR_ENV" > /dev/null

  # Extract public and secret keys from the temp credentials file
  PUBLIC_KEY=$(jq -r '.public_key' "$TEMP_CREDENTIALS_FILE")
  SECRET_KEY=$(jq -r '.private_key' "$TEMP_CREDENTIALS_FILE")

  # Add the public key to the relayer account
  near add-key "$ACCOUNT_ID" "$PUBLIC_KEY" --networkId "$NEAR_ENV"
  if [ $? -ne 0 ]; then
    echo "Failed to add key $PUBLIC_KEY to $ACCOUNT_ID. Exiting."
    rm -f "$TEMP_CREDENTIALS_FILE"
    exit 1
  fi

  # Add to JSON file
  JSON_ENTRY="{\"account_id\":\"$ACCOUNT_ID\", \"public_key\":\"$PUBLIC_KEY\", \"secret_key\":\"$SECRET_KEY\"}"
  jq ". += [${JSON_ENTRY}]" "$KEY_FILE" > tmp.$$.json && mv tmp.$$.json "$KEY_FILE"

  # Remove the temp credentials file
  rm -f "$TEMP_CREDENTIALS_FILE"
done

# Update config.toml
if grep -q "keys_filename" "$CONFIG_FILE"; then
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s|keys_filename = \".*\"|keys_filename = \"$KEY_FILE\"|" "$CONFIG_FILE"
  else
    sed -i "s|keys_filename = \".*\"|keys_filename = \"$KEY_FILE\"|" "$CONFIG_FILE"
  fi
else
  echo "keys_filename = \"$KEY_FILE\"" >> "$CONFIG_FILE"
fi

echo "All keys have been successfully generated and saved to $KEY_FILE."