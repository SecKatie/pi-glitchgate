<<<<<<< HEAD
# pi-glitchgate
GlitchGate Pi - Glitch protection for Raspberry Pi projects
=======
# glitchgate-pi

Pi coding agent extension that provides access to [Glitchgate](https://glitchgate.corp.mulliken.net) models via API key authentication.

## Setup

1. Install the package alongside pi:

   ```sh
   npm install glitchgate-pi
   ```

2. Set your API key:

   ```sh
   export GLITCHGATE_API_KEY="your-key-here"
   ```

3. Load the extension with pi:

   ```sh
   pi -e ./node_modules/glitchgate-pi
   ```

## How It Works

On startup, the extension fetches the list of available models from the Glitchgate API and registers them as an OpenAI-compatible provider. Models are dynamically discovered — no hardcoding required.

## License

MIT
>>>>>>> ce0a93b (Initial commit)
