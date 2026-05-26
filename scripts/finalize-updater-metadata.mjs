#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const version = process.env.VERSION || process.argv[2] || '';
const repository = process.env.GITHUB_REPOSITORY || process.argv[3] || '';

if (!version.startsWith('v')) {
  throw new Error('VERSION must be a tag like v1.0.18');
}
if (!repository || !repository.includes('/')) {
  throw new Error('GITHUB_REPOSITORY must be set, for example anYuJia/DY_video_downloader');
}

const appVersion = version.slice(1);
const baseUrl = `https://github.com/${repository}/releases/download/${version}`;

function requireFile(name) {
  if (!fs.existsSync(name)) {
    throw new Error(`Missing release asset: ${name}`);
  }
  return name;
}

function readSignature(assetName) {
  const sigPath = `${assetName}.sig`;
  if (!fs.existsSync(sigPath)) {
    throw new Error(`Missing signature file: ${sigPath}`);
  }
  return fs.readFileSync(sigPath, 'utf8').replace(/[\r\n]/g, '');
}

function platform(assetName) {
  requireFile(assetName);
  return {
    signature: readSignature(assetName),
    url: `${baseUrl}/${assetName}`
  };
}

const assets = {
  darwinArmDmg: `DY-Video-Downloader-v${appVersion}-macos-arm64.dmg`,
  darwinArmPortable: `DY-Video-Downloader-v${appVersion}-macos-arm64-portable.zip`,
  darwinX64Dmg: `DY-Video-Downloader-v${appVersion}-macos-x64.dmg`,
  darwinX64Portable: `DY-Video-Downloader-v${appVersion}-macos-x64-portable.zip`,
  windowsInstaller: `DY-Video-Downloader-v${appVersion}-windows-x64-installer.exe`,
  windowsPortable: `DY-Video-Downloader-v${appVersion}-windows-x64-portable.zip`,
  linuxTar: `DY-Video-Downloader-v${appVersion}-linux-x64.tar.gz`,
  linuxDeb: `DY-Video-Downloader-v${appVersion}-linux-x64.deb`,
  linuxRpm: `DY-Video-Downloader-v${appVersion}-linux-x64.rpm`
};

const metadata = {
  version: appVersion,
  notes: '',
  pub_date: '',
  platforms: {
    'darwin-aarch64': platform(assets.darwinArmDmg),
    'darwin-aarch64-portable': platform(assets.darwinArmPortable),
    'darwin-x86_64': platform(assets.darwinX64Dmg),
    'darwin-x86_64-portable': platform(assets.darwinX64Portable),
    'windows-x86_64': platform(assets.windowsInstaller),
    'windows-x86_64-nsis': platform(assets.windowsInstaller),
    'windows-x86_64-portable': platform(assets.windowsPortable),
    'linux-x86_64': platform(assets.linuxTar),
    'linux-x86_64-tar': platform(assets.linuxTar),
    'linux-x86_64-deb': platform(assets.linuxDeb),
    'linux-x86_64-rpm': platform(assets.linuxRpm)
  }
};

for (const [target, data] of Object.entries(metadata.platforms)) {
  if (!data.signature || !data.url) {
    throw new Error(`Incomplete updater metadata for ${target}`);
  }
}

for (const output of ['latest.json', 'darwin.json', 'windows.json', 'linux.json']) {
  fs.writeFileSync(path.join(process.cwd(), output), `${JSON.stringify(metadata, null, 2)}\n`);
}

console.log(`Generated updater metadata for ${version}`);
