# What to ask IT

Three questions. The answers decide how the travel system gets built, and none
of them commit you to anything.

---

**Subject: SharePoint site for the travel desk — three questions**

Hello,

The travel desk currently runs on a shared Excel workbook (`Master Sheet.xlsx`).
It works, but only one person can safely edit it at a time, there is no record
of who changed a flight time, and access is whoever has the file.

We would like to move it onto SharePoint. Before we plan anything, three
questions:

**1. Can we have a SharePoint site for the travel desk?**
A standard team site is fine. We would create three lists in it — movements,
settings, and an activity log — using the Microsoft PnP PowerShell module, run
once by a Site Owner. It creates lists and columns only; it does not change any
tenant setting.

**2. Does our tenant have a SharePoint App Catalog, and can a package be
deployed to it?**
This is the important one. If yes, the app can be a SharePoint Framework (SPFx)
web part that sits on a page inside the site and reads the lists directly. It
would need a tenant administrator to approve one package, once.
If no, we would use Power Apps instead, which needs no approval but means
rebuilding the screens.

**3. Who would own re-deploying the package when it changes?**
For SPFx, an updated version is a new package uploaded to the same catalog.
We want to know whose job that is before we depend on it.

**What we get either way:** permissions come from Microsoft accounts, so there
are no separate passwords to manage and somebody who leaves the company loses
access when their account is disabled. SharePoint keeps 50 versions of every
record and a 93-day recycle bin underneath it.

Thanks,

---

## How to read their answer

| They say | What it means |
|---|---|
| App Catalog exists, someone can deploy | **SPFx.** The best outcome — the React code already written carries over. |
| No App Catalog, or nobody will own deployment | **Power Apps** on the same lists. Screens get rebuilt; the lists and the import work are unaffected. |
| No SharePoint site at all | Fall back to a hosted web app, which is a bigger ask: a server, and its own login system. |

In all three cases the list setup and the column mapping stay exactly the same,
which is why that part is worth doing before you get an answer.

## Two things SharePoint will not solve

- **Ticket scanning and flight lookups** need an API key. A key placed inside a
  web part is readable by every user who opens it, so this needs a small Azure
  Function holding the key server-side. Worth doing after the pilot, not before.
- **Reminders that reach a phone** need a Power Automate flow reading the list
  on a schedule. In-app reminders only fire while a browser is open.
