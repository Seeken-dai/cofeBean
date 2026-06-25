import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

await mkdir('assets', { recursive: true });
await sharp('resources/logo.svg').resize(1024, 1024).png().toFile('assets/icon-only.png');
await sharp('resources/logo.svg').resize(1024, 1024).png().toFile('assets/icon-foreground.png');
await sharp({ create: { width: 1024, height: 1024, channels: 4, background: '#1a1412' } }).png().toFile('assets/icon-background.png');
await sharp('resources/splash.svg').resize(2732, 2732).png().toFile('assets/splash.png');
await sharp('resources/splash.svg').resize(2732, 2732).png().toFile('assets/splash-dark.png');
