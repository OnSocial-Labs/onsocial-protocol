# OnSocial Mobile App

This is the Expo-based mobile app for OnSocial, a decentralized, gasless social media platform on NEAR Protocol.

## Key Commands

Use `make` commands from the monorepo root for app development. Run `make help` for a full list.

- `make build-app` — Build the app (TypeScript compilation).
- `make test-app` — Run Vitest tests.
- `make lint-app` — Lint code with ESLint.
- `make format-app` — Format code with Prettier.
- `make start-app` — Start the app with Expo (mobile/web).

## Updated Commands

The following commands have been added or updated in the `Makefile` for app development:

- `make build-app-js` - Build the app package.
- `make test-app-js` - Run tests for the app package.
- `make lint-app-js` - Lint the app package.
- `make format-app-js` - Format the app package.
- `make start-app-js` - Start the app using Expo.

Refer to the monorepo root `README.md` for additional commands and details.

## Prerequisites

- **Node.js**: Version 18+.
- **pnpm**: Version 8+ (installed in the monorepo root).
- **Expo CLI**: `pnpm install -g expo-cli`.
- **Expo Go**: Mobile app for iOS/Android testing.
- **Docker**: For building and testing (uses `onsocial-js-builder` image).
- **Monorepo Setup**: Follow the root `README.md` to set up the monorepo (`pnpm install`, `make build-js-docker`).

## Contributing

See `CONTRIBUTING.md` in the monorepo root for guidelines. For app-specific contributions:

- Add tests for new features.
- Run `make lint-app` and `make format-app` before PRs.
- Document new screens/hooks in this `README.md`.

## Resources

- **Monorepo README**: `../../README.md`
- **Deployment Guide**: `../../Resources/deployment-guide.md`
- **AI Prompts**: `../../Resources/ai-prompts.md`
- **Expo Documentation**: [docs.expo.dev](https://docs.expo.dev)
- **NativeWind**: [nativewind.dev](https://www.nativewind.dev)

## License

MIT
