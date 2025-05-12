# Auth-OnSocial Contract

The `auth-onsocial` contract provides user authentication and multisignature functionality for the OnSocial Protocol. It ensures secure and flexible account management.

## Key Features

- **User Authentication**: Manage user accounts and keys.
- **Multisignature Support**: Enable multisig transactions for enhanced security.

## Key Methods

- `register_key`: Register a new key for an account.
- `remove_key`: Remove an existing key.
- `is_key_registered`: Check if a key is registered.
- `add_guardian`: Add a guardian for account recovery.
- `remove_guardian`: Remove a guardian.

## Deployment

To deploy the contract:

```bash
make deploy CONTRACT=auth-onsocial NETWORK=sandbox AUTH_ACCOUNT=test.near
```

## Testing

Run the tests for this contract:

```bash
make test-unit CONTRACT=auth-onsocial
```