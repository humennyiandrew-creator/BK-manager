import { app, protocol, net } from 'electron';
import { join, normalize } from 'node:path';
import { pathToFileURL } from 'node:url';

export const BK_DATA_SCHEME = 'bkdata';

export function registerBkDataSchemePrivileged(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: BK_DATA_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: true, stream: true }
    }
  ]);
}

function dataRoot(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'data')
    : join(__dirname, '../../data');
}

export function registerBkDataProtocol(): void {
  protocol.handle(BK_DATA_SCHEME, (request) => {
    const url = new URL(request.url);
    const relative = normalize(join(url.hostname, decodeURIComponent(url.pathname)));
    const root = dataRoot();
    const full = normalize(join(root, relative));
    if (!full.startsWith(normalize(root))) {
      return new Response('forbidden', { status: 403 });
    }
    return net.fetch(pathToFileURL(full).toString());
  });
}
