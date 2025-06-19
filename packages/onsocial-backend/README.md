# OnSocial Backend

This is the backend service for the OnSocial protocol. It acts as the secure gateway between the Expo app and the relayer, handling authentication, transaction validation, rate limiting, and more.

## Getting Started

1. Install dependencies:
   ```bash
   pnpm install
   ```
2. Run in development mode:
   ```bash
   pnpm dev
   ```
3. Build for production:
   ```bash
   pnpm build
   ```
4. Start in production:
   ```bash
   pnpm start
   ```

## Project Structure

- `src/` - Source code
- `src/index.ts` - Entry point

## Environment Variables

Create a `.env` file for configuration (see `.env.example`).

## License

MIT
