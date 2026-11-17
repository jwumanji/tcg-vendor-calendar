"""Synchronize verified production output and patch planner-only routes."""
import base64
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import sys
import tempfile

SITE = Path(os.environ['GRAILFOX_SITE'])
TEAM = os.environ['VERCEL_TEAM_ID']


def api(path):
    result = subprocess.run(['vercel', 'api', f'{path}?teamId={TEAM}'],
                            check=True, capture_output=True, text=True)
    return json.loads(result.stdout)


def sync():
    deployment = api('/v13/deployments/www.grailfoxtcg.com')['id']
    tree = api(f'/v6/deployments/{deployment}/files')
    parent = SITE / '.vercel'
    parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='grailfox-sync-', dir=parent) as temp:
        staging = Path(temp) / 'output'

        def walk(nodes, prefix=PurePosixPath()):
            for node in nodes:
                name = node['name']
                if name in ('', '.', '..') or '/' in name or '\\' in name:
                    raise ValueError(f'Unsafe file tree name: {name!r}')
                path = prefix / name
                if node['type'] == 'directory' or 'children' in node:
                    walk(node.get('children', []), path)
                else:
                    parts = path.parts
                    if parts[:3] != ('src', '.vercel', 'output'):
                        raise ValueError(f'Unexpected production file: {path}')
                    uid = node['uid']
                    data = base64.b64decode(api(f'/v8/deployments/{deployment}/files/{uid}')['data'], validate=True)
                    if hashlib.sha1(data).hexdigest() != uid:
                        raise ValueError(f'SHA-1 mismatch: {path}')
                    target = staging.joinpath(*parts[3:])
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(data)

        walk(tree if isinstance(tree, list) else [tree])
        if not (staging / 'config.json').is_file() or not (staging / 'static').is_dir():
            raise ValueError('Production output lacks config.json or static directory')
        output = parent / 'output'
        backup = Path(temp) / 'previous-output'
        if output.exists():
            output.rename(backup)
        try:
            staging.rename(output)
        except BaseException:
            if backup.exists():
                backup.rename(output)
            raise

        (parent / 'synced-deployment-id').write_text(deployment + '\n')


def check_production():
    synced = (SITE / '.vercel/synced-deployment-id').read_text().strip()
    current = api('/v13/deployments/www.grailfoxtcg.com')['id']
    if current != synced:
        raise ValueError(f'Production changed since sync ({synced} -> {current}); re-run the deploy script')


def patch():
    planner = os.environ['PLANNER_PATH']
    config_path = SITE / '.vercel/output/config.json'
    config = json.loads(config_path.read_text())
    if config.get('version') != 3:
        raise ValueError('Expected Build Output API version 3')
    escaped = re.escape(planner)
    sources = [f'^/{escaped}(?:/.*)?$', f'^/{escaped}$', f'^/{escaped}/[^.]*$']
    # Replace only the exact routes generated for this planner.
    routes = [r for r in config['routes'] if r.get('src') not in sources]
    if not routes or routes[0].get('continue') is not True:
        raise ValueError('Expected global security headers as first route')
    routes.insert(1, {'src': sources[0], 'headers': {'X-Robots-Tag': 'noindex, nofollow'}, 'continue': True})
    filesystem = next(i for i, r in enumerate(routes) if r.get('handle') == 'filesystem')
    routes.insert(filesystem, {'src': sources[1], 'status': 308, 'headers': {'Location': f'/{planner}/'}})
    routes.insert(filesystem + 2, {'src': sources[2], 'dest': f'/{planner}/index.html'})
    config['routes'] = routes
    config_path.write_text(json.dumps(config, indent=2) + '\n')
    project = SITE / '.vercel/project.json'
    if not project.exists():
        project.write_text(json.dumps({'projectId': os.environ['VERCEL_PROJECT_ID'], 'orgId': TEAM, 'settings': {}}, indent=2) + '\n')


if __name__ == '__main__':
    {'sync': sync, 'patch': patch, 'check-production': check_production}[sys.argv[1]]()
