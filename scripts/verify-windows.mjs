import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import * as RE from 'resedit';
const require = createRequire(import.meta.url);
const { getPath7za } = require('app-builder-lib/out/toolsets/7zip.js');
const { listPackage, extractFile } = require('@electron/asar');
const { version } = JSON.parse(fs.readFileSync('package.json','utf8'));
const executable = fs.readFileSync('out/win-unpacked/Hamshift.exe');
const peOffset = executable.readUInt32LE(0x3c);
assert.equal(executable.toString('ascii',peOffset,peOffset+4),'PE\u0000\u0000');
assert.equal(executable.readUInt16LE(peOffset+4),0x8664,'Application must be Windows x64');
const resources = RE.NtExecutableResource.from(RE.NtExecutable.from(executable));
const groups = RE.Resource.IconGroupEntry.fromEntries(resources.entries);
assert.ok(groups.length,'Executable has no icon group');
const icons = RE.Data.IconFile.from(fs.readFileSync('assets/hamshift.ico'));
assert.equal(groups[0].icons.length, icons.icons.length,'Icon resolutions did not survive packing');
const actualIcons = groups[0].getIconItemsFromEntries(resources.entries);
for (let i = 0; i < icons.icons.length; i++) {
  const expected = icons.icons[i].data;
  const actual = actualIcons[i];
  assert.deepEqual(Buffer.from(actual.isRaw() ? actual.bin : actual.generate()), Buffer.from(expected.isRaw() ? expected.bin : expected.generate()), 'Packaged icon differs from the Hamshift logo');
}
assert.ok(RE.Resource.VersionInfo.fromEntries(resources.entries).some(v => v.getStringValues({lang:1033,codepage:1200}).ProductName === 'Hamshift'));
const asar = 'out/win-unpacked/resources/app.asar';
const files = listPackage(asar);
for (const name of ['/dist/index.html','/electron/main.cjs','/electron/preload.cjs','/electron/reminders.mjs','/electron/splash.html','/electron/splash.js','/assets/hamshift.png','/assets/vazirmatn.woff2']) assert.ok(files.includes(name),`Missing packaged file ${name}`);
assert.equal(extractFile(asar,'electron/main.cjs').toString(),fs.readFileSync('electron/main.cjs','utf8'),'Packaged desktop code is stale');
assert.equal(extractFile(asar,'electron/reminders.mjs').toString(),fs.readFileSync('electron/reminders.mjs','utf8'),'Packaged reminder engine is stale');
assert.deepEqual(extractFile(asar,'dist/index.html'),fs.readFileSync('dist/index.html'),'Packaged calendar, themes or fonts are stale');
assert.ok(RE.Resource.VersionInfo.fromEntries(resources.entries).some(v => v.getStringValues({lang:1033,codepage:1200}).FileVersion === `${version}.0`),'Executable version does not match package.json');
const installer = path.resolve(`out/Hamshift-Setup-${version}-x64.exe`);
assert.ok(fs.statSync(installer).size > 1024*1024,'Installer is empty');
const setupResources = RE.NtExecutableResource.from(RE.NtExecutable.from(fs.readFileSync(installer)));
const setupIcons = RE.Resource.IconGroupEntry.fromEntries(setupResources.entries).flatMap(g => g.getIconItemsFromEntries(setupResources.entries));
const iconBytes = item => Buffer.from(item.isRaw() ? item.bin : item.generate());
assert.ok(setupIcons.some(actual => icons.icons.some(expected => iconBytes(actual).equals(iconBytes(expected.data)))),'Installer does not contain the branded Hamshift icon');
const zip = await getPath7za();
const temporary = fs.mkdtempSync(path.join(os.tmpdir(),'hamshift-installer-verify-'));
try {
  const result = spawnSync(zip, ['x',installer,`-o${temporary}`,'-y'], { encoding:'utf8', maxBuffer:8*1024*1024 });
  assert.equal(result.status,0,result.stderr || result.stdout);
  assert.deepEqual(fs.readFileSync(path.join(temporary,'Hamshift.exe')),executable,'Installer contains a different executable');
  assert.deepEqual(fs.readFileSync(path.join(temporary,'resources/app.asar')),fs.readFileSync(asar),'Installer contains a different app');
  // NSIS generates Uninstall.exe at installation time. It is not a normal
  // File payload that 7-Zip can extract; windows-install-smoke.ps1 checks the
  // generated uninstaller on Windows rather than mistaking this for a missing file.
} finally { fs.rmSync(temporary,{recursive:true,force:true}); }
const hash = crypto.createHash('sha256').update(fs.readFileSync(installer)).digest('hex');
fs.writeFileSync(installer+'.sha256',`${hash}  ${path.basename(installer)}\n`);
console.log('PASS: Windows x64 PE, branded executable icon/version, current packaged app, NSIS extraction and byte-for-byte payload integrity.');
console.log(`${hash}  ${path.basename(installer)}`);
