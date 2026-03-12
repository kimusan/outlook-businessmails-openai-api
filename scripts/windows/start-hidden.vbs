Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

installDir = fso.GetParentFolderName(WScript.ScriptFullName)
exePath = installDir & "\OutlookAiLocalHost.exe"

If fso.FileExists(exePath) Then
  shell.Run Chr(34) & exePath & Chr(34), 0, False
Else
  MsgBox "OutlookAiLocalHost.exe was not found in " & installDir, vbExclamation, "Outlook AI Local Host"
End If
