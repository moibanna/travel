<#
.SYNOPSIS
    Creates the SharePoint lists behind the Travel Logistics system.

.DESCRIPTION
    Run this once as a Site Owner. It creates:

      Travel Movements    one item per movement, with a real typed column for
                          every field currently held in the Master Sheet
      Travel Settings     key/value configuration (team list, rules, defaults)
      Travel Activity Log append-only record of who changed what and when

    It also creates the three permission groups and applies them directly to
    the lists, and indexes the columns the app filters on so views keep working
    past SharePoint's 5,000-item list view threshold.

    The script is idempotent: running it again adds anything missing and
    changes nothing that already exists. It never deletes data.

    This list is worth creating even if the app is never built on top of it.
    On its own it is readable in SharePoint, filterable into views, exportable
    to Excel and connectable to Power BI.

.PARAMETER SiteUrl
    The SharePoint site to build in, e.g.
    https://contoso.sharepoint.com/sites/TravelLogistics

.PARAMETER SkipPermissions
    Create the lists and columns but leave permissions inherited from the site.
    Use this if your organisation manages access with its own groups.

.EXAMPLE
    Connect and build everything:
        .\Setup-TravelLists.ps1 -SiteUrl https://contoso.sharepoint.com/sites/TravelLogistics

.NOTES
    Requires the PnP.PowerShell module:
        Install-Module PnP.PowerShell -Scope CurrentUser

    First use in a tenant may need an administrator to consent to PnP once:
        Register-PnPEntraIDAppForInteractiveLogin -ApplicationName "PnP Rollout" -Tenant contoso.onmicrosoft.com
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$SiteUrl,

    [string]$MovementsList = "Travel Movements",
    [string]$SettingsList  = "Travel Settings",
    [string]$ActivityList  = "Travel Activity Log",

    [switch]$SkipPermissions
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

# --------------------------------------------------------------------------
# Helpers — every one of these is safe to call repeatedly.
# --------------------------------------------------------------------------

function Write-Step   { param([string]$Message) Write-Host "`n== $Message" -ForegroundColor Cyan }
function Write-Made   { param([string]$Message) Write-Host "   + $Message" -ForegroundColor Green }
function Write-Kept   { param([string]$Message) Write-Host "   . $Message (already present)" -ForegroundColor DarkGray }

function Confirm-List {
    <#  Returns the list, creating it if it does not exist. #>
    param(
        [Parameter(Mandatory)][string]$Title,
        [string]$Description = ""
    )

    $list = Get-PnPList -Identity $Title -ErrorAction SilentlyContinue
    if ($null -ne $list) {
        Write-Kept "List '$Title'"
        return $list
    }

    $list = New-PnPList -Title $Title -Template GenericList -OnQuickLaunch
    if ($Description) {
        Set-PnPList -Identity $Title -Description $Description | Out-Null
    }
    Write-Made "List '$Title'"
    return $list
}

function Confirm-Field {
    <#
        Adds a column if it is missing. Choice columns are created with their
        options; existing choice columns are left alone so options added by
        hand in SharePoint are never wiped out.
    #>
    param(
        [Parameter(Mandatory)][string]$List,
        [Parameter(Mandatory)][string]$InternalName,
        [Parameter(Mandatory)][string]$DisplayName,
        [Parameter(Mandatory)][ValidateSet("Text","Note","Number","DateTime","Boolean","Choice","MultiChoice")]
        [string]$Type,
        [string[]]$Choices = @(),
        [switch]$Required,
        [switch]$Indexed,
        [switch]$DateOnly,
        [string]$Description = "",
        $DefaultValue = $null
    )

    $existing = Get-PnPField -List $List -Identity $InternalName -ErrorAction SilentlyContinue
    if ($null -ne $existing) {
        Write-Kept "$List.$DisplayName"
    }
    else {
        $params = @{
            List         = $List
            InternalName = $InternalName
            DisplayName  = $DisplayName
            Type         = $Type
            AddToDefaultView = $true
        }
        if ($Type -in @("Choice", "MultiChoice") -and $Choices.Count -gt 0) {
            $params["Choices"] = $Choices
        }

        Add-PnPField @params | Out-Null
        Write-Made "$List.$DisplayName ($Type)"
    }

    # Applied on every run so a field created by an earlier version of this
    # script picks up settings added later.
    $values = @{}
    if ($Required)            { $values["Required"] = $true }
    if ($Indexed)             { $values["Indexed"]  = $true }
    if ($Description)         { $values["Description"] = $Description }
    if ($DateOnly)            { $values["DisplayFormat"] = 0 }   # 0 = date only, 1 = date and time
    if ($null -ne $DefaultValue) { $values["DefaultValue"] = $DefaultValue }

    if ($values.Count -gt 0) {
        try {
            Set-PnPField -List $List -Identity $InternalName -Values $values -ErrorAction Stop | Out-Null
        }
        catch {
            Write-Warning "Could not apply settings to $List.$DisplayName : $($_.Exception.Message)"
        }
    }
}

function Confirm-Group {
    param(
        [Parameter(Mandatory)][string]$Title,
        [Parameter(Mandatory)][string]$Description
    )

    $group = Get-PnPGroup -Identity $Title -ErrorAction SilentlyContinue
    if ($null -ne $group) {
        Write-Kept "Group '$Title'"
        return $group
    }

    $group = New-PnPGroup -Title $Title -Description $Description
    Write-Made "Group '$Title'"
    return $group
}

# --------------------------------------------------------------------------
# Column definitions — the canonical shape of a movement.
#
# These mirror the Master Sheet columns one for one, with three deliberate
# changes carried over from the app:
#   * the combined "Flight A/D" cell becomes two columns, so each leg can be
#     filtered and reported on separately;
#   * "Time" is stored as text in 24-hour form, because the source data uses
#     TBC as often as it uses a time, and a real time column cannot hold that;
#   * FT / CIP move out of free-text Remarks into their own column.
# --------------------------------------------------------------------------

$MovementColumns = @(
    @{ InternalName = "RefNo"; DisplayName = "No."; Type = "Number"; Required = $true; Indexed = $true
       Description = "The operational reference number carried over from the Master Sheet." }

    @{ InternalName = "Company"; DisplayName = "Company"; Type = "Text" }

    # ---- Arrival leg ----
    @{ InternalName = "ArrivalDate"; DisplayName = "Arrival"; Type = "DateTime"; DateOnly = $true; Indexed = $true }
    @{ InternalName = "ArrivalTime"; DisplayName = "Arrival time"; Type = "Text"
       Description = "24-hour, HH:MM. Leave blank when the time is not yet confirmed." }
    @{ InternalName = "ArrivalFlight"; DisplayName = "Arrival flight"; Type = "Text" }
    @{ InternalName = "ArrivalRoute"; DisplayName = "Arrival route"; Type = "Text"
       Description = "Where the passenger goes on landing, e.g. 'EIA to Ramada'." }

    # ---- Departure leg ----
    @{ InternalName = "DepartureDate"; DisplayName = "Departure"; Type = "DateTime"; DateOnly = $true; Indexed = $true }
    @{ InternalName = "DepartureTime"; DisplayName = "Departure time"; Type = "Text" }
    @{ InternalName = "DepartureFlight"; DisplayName = "Departure flight"; Type = "Text" }
    @{ InternalName = "DepartureRoute"; DisplayName = "Departure route"; Type = "Text" }

    @{ InternalName = "Airport"; DisplayName = "Airport"; Type = "Choice"
       Choices = @("EIA", "Mardin", "Shirnak", "Sulaymaniyah", "Baghdad", "Other") }

    # ---- Request provenance ----
    @{ InternalName = "RequestDate"; DisplayName = "Request received"; Type = "DateTime"; DateOnly = $true
       Description = "The 'E-Mail date' column: when the request reached the travel desk." }
    @{ InternalName = "ReceivedFrom"; DisplayName = "Received from"; Type = "Text"
       Description = "KT, TRF, Movcon, or the name of the requester." }
    @{ InternalName = "RegisteredBy"; DisplayName = "Registered by"; Type = "Choice"; Indexed = $true
       Choices = @("Kamiran", "Mohammed", "Muhammed", "Zana", "Idrees", "Farhang", "Omid") }

    # ---- Service and status ----
    @{ InternalName = "ServiceType"; DisplayName = "Service"; Type = "MultiChoice"
       Choices = @("FT", "CIP", "NJ")
       Description = "Pulled out of the Remarks column so it can be filtered and counted." }
    @{ InternalName = "FlightStatus"; DisplayName = "Flight status"; Type = "Choice"
       Choices = @("Confirmed", "Revised", "Cancelled"); DefaultValue = "Confirmed" }
    @{ InternalName = "MovementStatus"; DisplayName = "Status"; Type = "Choice"; Indexed = $true
       Choices = @("Planned", "Confirmed", "In country", "Departed", "Cancelled"); DefaultValue = "Planned" }
    @{ InternalName = "TrfReceived"; DisplayName = "TRF received"; Type = "Boolean"; DefaultValue = "1"
       Description = "Rows that said 'No TRF yet' come across unticked." }
    @{ InternalName = "Completed"; DisplayName = "Completed"; Type = "Boolean"; DefaultValue = "0"
       Description = "Ticked when the movement needs no further action." }

    @{ InternalName = "Remarks"; DisplayName = "Remarks"; Type = "Note" }

    @{ InternalName = "SourceRow"; DisplayName = "Master Sheet row"; Type = "Number"
       Description = "Row this item was imported from, so anything odd can be traced back." }
)

$SettingsColumns = @(
    @{ InternalName = "SettingValue"; DisplayName = "Value"; Type = "Note"
       Description = "JSON or plain text, depending on the setting." }
    @{ InternalName = "SettingCategory"; DisplayName = "Category"; Type = "Choice"
       Choices = @("Team", "Rules", "Defaults", "Config") }
)

$ActivityColumns = @(
    @{ InternalName = "ActorEmail"; DisplayName = "Who"; Type = "Text"; Indexed = $true }
    @{ InternalName = "ActionType"; DisplayName = "Action"; Type = "Choice"
       Choices = @("Create", "Update", "Delete", "Import", "Restore", "Sign in") }
    @{ InternalName = "TargetRefNo"; DisplayName = "Movement no."; Type = "Number"; Indexed = $true }
    @{ InternalName = "Summary"; DisplayName = "Summary"; Type = "Note" }
    @{ InternalName = "ChangeDetail"; DisplayName = "Detail"; Type = "Note"
       Description = "Field-level before/after values as JSON." }
)

# --------------------------------------------------------------------------
# Build
# --------------------------------------------------------------------------

Write-Host "Travel Logistics — SharePoint setup" -ForegroundColor White
Write-Host "Site: $SiteUrl"

Write-Step "Connecting"
Connect-PnPOnline -Url $SiteUrl -Interactive
$web = Get-PnPWeb
Write-Host "   Connected to '$($web.Title)'"

# ---- Movements -----------------------------------------------------------
Write-Step "List: $MovementsList"
Confirm-List -Title $MovementsList `
    -Description "One item per travel movement. Replaces the Flights tab of the Master Sheet." | Out-Null

# The built-in Title column is mandatory in SharePoint, so rather than leave an
# unused "Title" the passenger's name is stored in it. It is indexed by default
# and is what SharePoint search matches on.
$titleField = Get-PnPField -List $MovementsList -Identity "Title"
if ($titleField.Title -ne "Passenger") {
    Set-PnPField -List $MovementsList -Identity "Title" -Values @{
        Title       = "Passenger"
        Description = "Full name of the traveller."
    } | Out-Null
    Write-Made "$MovementsList.Passenger (renamed from Title)"
}
else {
    Write-Kept "$MovementsList.Passenger"
}

foreach ($column in $MovementColumns) {
    Confirm-Field -List $MovementsList @column
}

# ---- Settings ------------------------------------------------------------
Write-Step "List: $SettingsList"
Confirm-List -Title $SettingsList `
    -Description "Configuration for the travel app: team list, rules and defaults." | Out-Null
foreach ($column in $SettingsColumns) {
    Confirm-Field -List $SettingsList @column
}

# ---- Activity log --------------------------------------------------------
Write-Step "List: $ActivityList"
Confirm-List -Title $ActivityList `
    -Description "Append-only record of changes. Do not edit items here by hand." | Out-Null
foreach ($column in $ActivityColumns) {
    Confirm-Field -List $ActivityList @column
}

# ---- Versioning ----------------------------------------------------------
Write-Step "Versioning"
Set-PnPList -Identity $MovementsList -EnableVersioning $true -MajorVersions 50 | Out-Null
Write-Made "$MovementsList keeps 50 versions of every item"
Set-PnPList -Identity $SettingsList -EnableVersioning $true -MajorVersions 20 | Out-Null
Write-Made "$SettingsList keeps 20 versions"

# ---- Views ---------------------------------------------------------------
# Views use [Today] so they stay correct without anyone maintaining them.
Write-Step "Views"

$views = @(
    @{
        Title  = "Arrivals today"
        Fields = @("RefNo","Title","ArrivalTime","ArrivalFlight","ArrivalRoute","Airport","RegisteredBy","ServiceType","Remarks")
        Query  = "<Where><Eq><FieldRef Name='ArrivalDate'/><Value Type='DateTime'><Today/></Value></Eq></Where><OrderBy><FieldRef Name='ArrivalTime'/></OrderBy>"
    },
    @{
        Title  = "Departures today"
        Fields = @("RefNo","Title","DepartureTime","DepartureFlight","DepartureRoute","Airport","RegisteredBy","ServiceType","Remarks")
        Query  = "<Where><Eq><FieldRef Name='DepartureDate'/><Value Type='DateTime'><Today/></Value></Eq></Where><OrderBy><FieldRef Name='DepartureTime'/></OrderBy>"
    },
    @{
        # Persons on board: arrived, and not yet departed.
        Title  = "In country"
        Fields = @("RefNo","Title","Company","ArrivalDate","ArrivalRoute","DepartureDate","RegisteredBy")
        Query  = "<Where><And><Leq><FieldRef Name='ArrivalDate'/><Value Type='DateTime'><Today/></Value></Leq><Or><IsNull><FieldRef Name='DepartureDate'/></IsNull><Geq><FieldRef Name='DepartureDate'/><Value Type='DateTime'><Today/></Value></Geq></Or></And></Where><OrderBy><FieldRef Name='ArrivalDate'/></OrderBy>"
    },
    @{
        Title  = "Missing TRF"
        Fields = @("RefNo","Title","ArrivalDate","ArrivalRoute","ReceivedFrom","RegisteredBy","Remarks")
        Query  = "<Where><And><Eq><FieldRef Name='TrfReceived'/><Value Type='Boolean'>0</Value></Eq><Geq><FieldRef Name='ArrivalDate'/><Value Type='DateTime'><Today/></Value></Geq></And></Where><OrderBy><FieldRef Name='ArrivalDate'/></OrderBy>"
    }
)

foreach ($view in $views) {
    $existing = Get-PnPView -List $MovementsList -Identity $view.Title -ErrorAction SilentlyContinue
    if ($null -ne $existing) {
        Write-Kept "View '$($view.Title)'"
        continue
    }
    Add-PnPView -List $MovementsList -Title $view.Title -Fields $view.Fields -Query $view.Query | Out-Null
    Write-Made "View '$($view.Title)'"
}

# ---- Permissions ---------------------------------------------------------
# Applied to the lists directly rather than the site, so the same site can hold
# other content without everyone inheriting travel-desk rights.
if ($SkipPermissions) {
    Write-Step "Permissions — skipped at your request"
}
else {
    Write-Step "Permissions"

    $groups = @(
        @{ Title = "Travel Super Admins"; Role = "Full Control"
           Description = "Can configure the system and permanently delete records." }
        @{ Title = "Travel Movcon"; Role = "Contribute"
           Description = "Day-to-day travel desk. Can add and edit movements, but not delete them." }
        @{ Title = "Travel Viewers"; Role = "Read"
           Description = "Can see movements and reports. Cannot change anything." }
    )

    foreach ($group in $groups) {
        Confirm-Group -Title $group.Title -Description $group.Description | Out-Null
    }

    foreach ($list in @($MovementsList, $SettingsList, $ActivityList)) {
        # Copying the existing assignments first means site owners keep their
        # access and nobody is locked out by running this.
        Set-PnPList -Identity $list -BreakRoleInheritance -CopyRoleAssignments | Out-Null

        foreach ($group in $groups) {
            Set-PnPListPermission -Identity $list -Group $group.Title -AddRole $group.Role | Out-Null
        }
        Write-Made "$list — Super Admins: Full Control, Movcon: Contribute, Viewers: Read"
    }

    Write-Host "`n   Note: Contribute lets a member edit and delete their own items." -ForegroundColor Yellow
    Write-Host "   To stop the desk deleting anything at all, create a custom" -ForegroundColor Yellow
    Write-Host "   permission level based on Contribute with 'Delete Items' cleared." -ForegroundColor Yellow
}

# --------------------------------------------------------------------------
Write-Step "Done"
Write-Host @"
   Lists created:
     $MovementsList
     $SettingsList
     $ActivityList

   Next:
     1. Add people to the three Travel groups in Site Settings.
     2. Import the Master Sheet — see sharepoint/FIELD-MAP.md for how the
        spreadsheet columns line up with the columns above.
     3. Open the list in SharePoint and check the four views look right.

   The list is usable on its own from here. Deleted items go to the site
   Recycle Bin and can be restored for 93 days.
"@ -ForegroundColor White

Disconnect-PnPOnline
