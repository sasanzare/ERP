import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configuredPhp = process.env.ERP_PHP_BINARY?.trim();
const phpExecutable = configuredPhp
    ? configuredPhp.replace(/^"(.+)"$/, '$1')
    : 'C:\\php8.5\\php.exe';
const viteCli = path.join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js');

if (!existsSync(phpExecutable)) {
    console.error(`PHP executable not found: ${phpExecutable}`);
    console.error('Set ERP_PHP_BINARY to the PHP 8.5 executable path.');
    process.exit(1);
}

if (!existsSync(viteCli)) {
    console.error(`Vite CLI not found: ${viteCli}`);
    console.error('Install the locked npm dependencies with npm ci.');
    process.exit(1);
}

console.log('Starting Laravel and Vite. The MariaDB/Docker service must be started separately.');
console.log('Laravel: http://127.0.0.1:8000');
console.log('Vite:    http://127.0.0.1:5173');
console.log('Press Ctrl+C to stop both servers.');

const children = [];
let shutdownRequested = false;
let shutdownCode = 0;
let forceStopTimer;

function isRunning(child) {
    return child.exitCode === null && child.signalCode === null;
}

function finishIfStopped() {
    if (!shutdownRequested || children.some(isRunning)) return;

    if (forceStopTimer) clearTimeout(forceStopTimer);
    process.exit(shutdownCode);
}

function stopServers(code = 0, message = '') {
    if (shutdownRequested) {
        if (code !== 0) shutdownCode = code;
        return;
    }

    shutdownRequested = true;
    shutdownCode = code;
    if (message) console.error(message);

    for (const child of children) {
        if (isRunning(child)) child.kill();
    }

    forceStopTimer = setTimeout(() => {
        for (const child of children) {
            if (isRunning(child)) child.kill('SIGKILL');
        }
        process.exit(shutdownCode || 1);
    }, 5000);
    forceStopTimer.unref();
    finishIfStopped();
}

function startServer(name, command, args) {
    const child = spawn(command, args, {
        cwd: projectRoot,
        env: process.env,
        stdio: 'inherit',
        windowsHide: true,
    });
    children.push(child);

    child.on('error', (error) => {
        stopServers(1, `${name} failed to start: ${error.message}`);
    });
    child.on('exit', (code, signal) => {
        if (!shutdownRequested) {
            const result = signal ? `signal ${signal}` : `exit code ${code ?? 1}`;
            stopServers(code && code !== 0 ? code : 1, `${name} stopped unexpectedly (${result}); stopping the other server.`);
        } else {
            finishIfStopped();
        }
    });

    return child;
}

process.once('SIGINT', () => stopServers(0));
process.once('SIGTERM', () => stopServers(0));

startServer('Laravel', phpExecutable, ['artisan', 'serve', '--host=127.0.0.1', '--port=8000']);
startServer('Vite', process.execPath, [viteCli, '--host', '127.0.0.1', '--strictPort']);
