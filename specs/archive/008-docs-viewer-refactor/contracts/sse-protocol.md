# SSE Protocol: Live Reload

**Feature**: 008-docs-viewer-refactor
**Date**: 2026-01-28

## Overview

The dev server uses Server-Sent Events (SSE) to notify the browser when files change, triggering automatic page reloads.

## Endpoint

```
GET /__reload
```

## Protocol

### Connection

Client connects using the `EventSource` API:

```javascript
const source = new EventSource('/__reload');
```

### Server Response Headers

```http
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

### Events

#### Reload Event

Sent when any watched file changes.

```
data: reload

```

Note: The blank line after `data:` is required by SSE protocol.

#### Heartbeat Event (Optional)

Sent every 30 seconds to keep connection alive.

```
: heartbeat

```

Note: Lines starting with `:` are comments in SSE, ignored by clients.

### Client Handling

```javascript
source.onmessage = (event) => {
  if (event.data === 'reload') {
    location.reload();
  }
};

source.onerror = () => {
  // Reconnect automatically (EventSource default behavior)
  console.log('SSE connection lost, reconnecting...');
};
```

## Injection

The SSE client script is injected by the dev server at response time when serving `index.html`:

```javascript
// Server-side injection (never written to files)
const SSE_CLIENT_SCRIPT = `
<script>
(function() {
  var source = new EventSource('/__reload');
  source.onmessage = function() { location.reload(); };
  source.onerror = function() { console.log('Live reload disconnected'); };
})();
</script>
`;

// Injected before </body>
html = html.replace('</body>', SSE_CLIENT_SCRIPT + '</body>');
```

## Security

- SSE endpoint only available on dev server (not in production)
- No authentication required (local development only)
- Client script never written to static files
- Production `index.html` has no reload code

## File Types Triggering Reload

| Extension          | Action                       |
| ------------------ | ---------------------------- |
| `.md`              | Reload (content change)      |
| `.js`              | Reload (viewer code change)  |
| `.css`             | Reload (style change)        |
| `.html`            | Reload (shell change)        |
| `.md` (add/remove) | Regenerate manifest + reload |
