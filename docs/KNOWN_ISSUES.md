# Known Issues

## OpenClaw Gateway Docker Container

**Status**: Non-blocking (services can run without OpenClaw)

**Issue**: OpenClaw Gateway ignores HTTP mode configuration and starts in WebSocket mode on port 18789 instead of HTTP mode on port 3000.

**Symptoms**:
- Container starts successfully
- Logs show: `[gateway] listening on ws://0.0.0.0:18789`
- Health check fails (expecting HTTP on port 3000)
- Configuration `openclaw.json` has `"mode": "http"` but is ignored

**Workaround**:
1. Continue development without OpenClaw Gateway
2. Test agent system once OpenClaw configuration is resolved
3. Focus on core RTB Hub functionality first

**Root Cause**: 
- Possible OpenClaw version mismatch
- Configuration file might need different structure
- Command-line args might not override config file

**Next Steps**:
- Review OpenClaw documentation for HTTP mode configuration
- Test with latest OpenClaw version
- Consider alternative: Run OpenClaw CLI locally instead of Docker

**Impact**: LOW
- PostgreSQL and Redis are healthy ✅
- RTB Hub core services can run independently ✅
- Agent coordination can be tested later ✅

