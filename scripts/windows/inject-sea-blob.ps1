param(
  [Parameter(Mandatory = $true)]
  [string]$ExePath,

  [Parameter(Mandatory = $true)]
  [string]$BlobPath,

  [string]$SentinelFuse = "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2"
)

$ErrorActionPreference = "Stop"

$ResolvedExePath = (Resolve-Path -LiteralPath $ExePath).Path
$ResolvedBlobPath = (Resolve-Path -LiteralPath $BlobPath).Path

if (-not (Test-Path -LiteralPath $ResolvedExePath)) {
  throw "Target executable not found: $ResolvedExePath"
}
if (-not (Test-Path -LiteralPath $ResolvedBlobPath)) {
  throw "SEA blob not found: $ResolvedBlobPath"
}

$csharpSource = @"
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

public static class NodeSeaPeInjector {
    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern IntPtr BeginUpdateResourceW(string pFileName, bool bDeleteExistingResources);

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern bool UpdateResourceW(IntPtr hUpdate, IntPtr lpType, string lpName, ushort wLanguage, byte[] lpData, uint cbData);

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern bool EndUpdateResourceW(IntPtr hUpdate, bool fDiscard);

    public static void Inject(string exePath, string blobPath, string fuseString) {
        if (!File.Exists(exePath)) {
            throw new FileNotFoundException("Executable file not found", exePath);
        }
        if (!File.Exists(blobPath)) {
            throw new FileNotFoundException("Blob file not found", blobPath);
        }

        byte[] blobData = File.ReadAllBytes(blobPath);

        // RT_RCDATA is 10
        IntPtr RT_RCDATA = new IntPtr(10);

        IntPtr hUpdate = BeginUpdateResourceW(exePath, false);
        if (hUpdate == IntPtr.Zero) {
            int err = Marshal.GetLastWin32Error();
            throw new Exception(string.Format("BeginUpdateResourceW failed with Win32 error code {0}", err));
        }

        bool updated = UpdateResourceW(hUpdate, RT_RCDATA, "NODE_SEA_BLOB", 0, blobData, (uint)blobData.Length);
        if (!updated) {
            int err = Marshal.GetLastWin32Error();
            EndUpdateResourceW(hUpdate, true);
            throw new Exception(string.Format("UpdateResourceW failed with Win32 error code {0}", err));
        }

        bool ended = EndUpdateResourceW(hUpdate, false);
        if (!ended) {
            int err = Marshal.GetLastWin32Error();
            throw new Exception(string.Format("EndUpdateResourceW failed with Win32 error code {0}", err));
        }

        // Find and flip sentinel fuse in the executable
        byte[] exeBytes = File.ReadAllBytes(exePath);
        byte[] fuseBytes = Encoding.ASCII.GetBytes(fuseString);

        int matchIndex = -1;
        for (int i = 0; i <= exeBytes.Length - fuseBytes.Length - 2; i++) {
            bool isMatch = true;
            for (int j = 0; j < fuseBytes.Length; j++) {
                if (exeBytes[i + j] != fuseBytes[j]) {
                    isMatch = false;
                    break;
                }
            }
            if (isMatch) {
                if (matchIndex != -1) {
                    throw new Exception("Multiple occurrences of sentinel fuse found in binary.");
                }
                matchIndex = i;
            }
        }

        if (matchIndex == -1) {
            throw new Exception(string.Format("Could not find sentinel fuse '{0}' in binary.", fuseString));
        }

        int colonIndex = matchIndex + fuseBytes.Length;
        if (exeBytes[colonIndex] != (byte)':') {
            throw new Exception(string.Format("Expected ':' after sentinel fuse at index {0}, but found '{1}'.", colonIndex, (char)exeBytes[colonIndex]));
        }

        int fuseValIndex = colonIndex + 1;
        if (exeBytes[fuseValIndex] == (byte)'0') {
            exeBytes[fuseValIndex] = (byte)'1';
        } else if (exeBytes[fuseValIndex] != (byte)'1') {
            throw new Exception(string.Format("Expected '0' or '1' after sentinel fuse at index {0}, but found '{1}'.", fuseValIndex, (char)exeBytes[fuseValIndex]));
        }

        File.WriteAllBytes(exePath, exeBytes);
    }
}
"@

Add-Type -TypeDefinition $csharpSource -Language CSharp
[NodeSeaPeInjector]::Inject($ResolvedExePath, $ResolvedBlobPath, $SentinelFuse)
Write-Host "Successfully injected SEA blob into $ResolvedExePath via Win32 UpdateResource."
