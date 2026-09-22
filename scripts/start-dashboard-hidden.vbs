Set shell = CreateObject("WScript.Shell")
Set fileSystem = CreateObject("Scripting.FileSystemObject")
scriptDirectory = fileSystem.GetParentFolderName(WScript.ScriptFullName)
shell.Run """" & fileSystem.BuildPath(scriptDirectory, "start-dashboard.cmd") & """", 0, False