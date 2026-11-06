// Значок и сведения о версии в Matlist.exe без wine (rcedit не нужен): правим ресурсы чистым JS (resedit).
const fs = require('fs'), path = require('path');
exports.default = async function (ctx) {
  if (ctx.electronPlatformName !== 'win32') return;
  const ResEdit = await import('resedit');
  const R = ResEdit.default || ResEdit;
  const exe = path.join(ctx.appOutDir, ctx.packager.appInfo.productFilename + '.exe');
  const file = fs.existsSync(exe) ? exe : path.join(ctx.appOutDir, 'Matlist.exe');
  const data = fs.readFileSync(file);
  const ex = R.NtExecutable.from(data, { ignoreCert: true });
  const res = R.NtExecutableResource.from(ex);
  const ico = R.Data.IconFile.from(fs.readFileSync(path.join(__dirname, 'build', 'icon.ico')));
  const groups = R.Resource.IconGroupEntry.fromEntries(res.entries);
  const id = groups.length ? groups[0].id : 1, lang = groups.length ? groups[0].lang : 1033;
  R.Resource.IconGroupEntry.replaceIconsForResource(res.entries, id, lang, ico.icons.map(i => i.data));
  const vis = R.Resource.VersionInfo.fromEntries(res.entries);
  const v = ctx.packager.appInfo.version.split('.').map(Number);
  for (const vi of vis) {
    vi.setFileVersion(v[0], v[1], v[2], 0); vi.setProductVersion(v[0], v[1], v[2], 0);
    for (const l of vi.getAllLanguagesForStringValues()) vi.setStringValues(l, { FileDescription: 'Матлист', ProductName: 'Матлист', CompanyName: 'Матлист', OriginalFilename: 'Matlist.exe', InternalName: 'Matlist' });
    vi.outputToResourceEntries(res.entries);
  }
  res.outputResource(ex);
  fs.writeFileSync(file, Buffer.from(ex.generate()));
  console.log('  • значок и версия записаны в', path.basename(file));
};
