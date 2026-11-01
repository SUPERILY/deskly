param([string]$JobsFile)
# Extracts high-resolution (up to 256px) shell icons to PNG files, in one batch.
# Input: JSON array of { src, dst, px, flags }.  flags: 0 = thumbnail/icon, 4 = icon only.
$ErrorActionPreference = 'Stop'

Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @"
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class IconGrab {
  [StructLayout(LayoutKind.Sequential)] struct SIZE { public int cx, cy; public SIZE(int x, int y) { cx = x; cy = y; } }

  [StructLayout(LayoutKind.Sequential)]
  struct BITMAP { public int bmType, bmWidth, bmHeight, bmWidthBytes; public short bmPlanes, bmBitsPixel; public IntPtr bmBits; }

  [ComImport, Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IShellItemImageFactory { [PreserveSig] int GetImage(SIZE size, int flags, out IntPtr phbm); }

  [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
  static extern void SHCreateItemFromParsingName([MarshalAs(UnmanagedType.LPWStr)] string path, IntPtr pbc, [In] ref Guid riid, [MarshalAs(UnmanagedType.Interface)] out IShellItemImageFactory ppv);

  [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr h);
  [DllImport("gdi32.dll")] static extern int GetObject(IntPtr h, int cb, out BITMAP bm);

  public static bool Save(string src, string dst, int px, int flags) {
    IntPtr hbm = IntPtr.Zero;
    try {
      Guid g = new Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b");
      IShellItemImageFactory f;
      SHCreateItemFromParsingName(src, IntPtr.Zero, ref g, out f);
      int hr = f.GetImage(new SIZE(px, px), flags, out hbm);
      if (hr != 0 || hbm == IntPtr.Zero) return false;
      BITMAP bm;
      GetObject(hbm, Marshal.SizeOf(typeof(BITMAP)), out bm);
      Bitmap result;
      if (bm.bmBitsPixel == 32 && bm.bmBits != IntPtr.Zero) {
        using (Bitmap tmp = new Bitmap(bm.bmWidth, bm.bmHeight, bm.bmWidthBytes, PixelFormat.Format32bppArgb, bm.bmBits)) {
          result = new Bitmap(tmp);
        }
        result.RotateFlip(RotateFlipType.RotateNoneFlipY);
      } else {
        result = Image.FromHbitmap(hbm);
      }
      using (result) { result.Save(dst, ImageFormat.Png); }
      return true;
    } catch { return false; }
    finally { if (hbm != IntPtr.Zero) DeleteObject(hbm); }
  }
}
"@

$jobs = Get-Content -Raw -LiteralPath $JobsFile | ConvertFrom-Json
foreach ($j in $jobs) {
  $ok = $false
  try { $ok = [IconGrab]::Save([string]$j.src, [string]$j.dst, [int]$j.px, [int]$j.flags) } catch { $ok = $false }
  if ($ok) { "OK`t$($j.dst)" } else { "FAIL`t$($j.src)" }
}
