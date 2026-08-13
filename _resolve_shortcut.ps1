$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("C:\Users\Asus\Desktop\Cardiac_Ogt_MultiOmics.lnk")
Write-Output $Shortcut.TargetPath
