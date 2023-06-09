# IIS and IIS Express extension for Visual Studio Code

This extension gives you the power to run web apps from a folder opened in Visual Studio Code using IIS/IIS Express web server.

[![Visual Studio Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/lextudio.iis?logo=visual-studio-code&style=for-the-badge)](https://marketplace.visualstudio.com/items?itemName=lextudio.iis)
[![Visual Studio Marketplace Installs](https://img.shields.io/visual-studio-marketplace/i/lextudio.iis?logo=visual-studio-code&style=for-the-badge)](https://marketplace.visualstudio.com/items?itemName=lextudio.iis)
[![Visual Studio Marketplace Downloads](https://img.shields.io/visual-studio-marketplace/d/lextudio.iis?logo=visual-studio-code&style=for-the-badge)](https://marketplace.visualstudio.com/items?itemName=lextudio.iis)
[![Visual Studio Marketplace Rating](https://img.shields.io/visual-studio-marketplace/r/lextudio.iis?logo=visual-studio-code&style=for-the-badge)](https://marketplace.visualstudio.com/items?itemName=lextudio.iis)
[![Build](https://img.shields.io/github/actions/workflow/status/JexusWebServer/vscode-iis/ci.yml?branch=main&logo=github&style=for-the-badge)](https://github.com/JexusWebServer/vscode-iis/actions)

## Call for Sponsorship
<a href="https://github.com/sponsors/lextm"><img src="https://github.githubassets.com/images/modules/site/sponsors/pixel-mona-heart.gif" align="left" height="24" /></a>
This is a **free extension**. If you find it useful to yourself or your business then <a href="https://github.com/sponsors/lextm">you might consider sponsoring it on Github</a>.

## Features

* Detect and launch Jexus Manager to enable the opened project on IIS/IIS Express web server.
* Multiple-folder workspace is fully supported.
* Access to most IIS/IIS Express configuration options.
* ASP.NET/ASP.NET Core/Blazor projects are fully supported.
* PHP support can be enabled manually.
* Node.js, Java, Python, Ruby, and Go support can be enabled by [adding HttpPlatformHandler to IIS Express](https://github.com/lextm/iisexpress-httpplatformhandler).
* CORS support can be enabled by [adding IIS CORS module to IIS Express](https://github.com/lextm/iisexpress-cors).

To learn more about Jexus Manager, you can visit [its documentation site](https://docs.jexusmanager.com/).

![VS Code](images/vscode-iis.gif)

## Requirements

* Windows
* [Jexus Manager](https://github.com/jexuswebserver/JexusManager/releases)
* [IIS Express](https://learn.microsoft.com/iis/extensions/introduction-to-iis-express/iis-express-overview#installing-iis-express)

## Available Commands

Use `View | Command Pallette...` to open the command list and search for the commands below,

* **Launch IIS/IIS Express from here** - Start Jexus Manager to perform IIS/IIS Express actions.
* **Reset IIS/IIS Express selected config file** - Change the config file Jexus Manager should use.

## Known Issues

* Initially only IIS Express mode is supported. IIS mode is under development.

## Release Notes

Release notes can be found at [GitHub](https://github.com/jexuswebserver/vscode-iis/releases).
