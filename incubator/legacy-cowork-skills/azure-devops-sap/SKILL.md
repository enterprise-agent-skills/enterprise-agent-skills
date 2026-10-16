---
name: Azure DevOps CI/CD for SAP
description: Accelerate SAP deployment automation with Azure Pipelines, gCTS integration, ABAP testing, Fiori deployment, Docker containers, quality gates, and infrastructure as code for SAP on Azure. Master CI/CD patterns that reduce release risk and automate everything from code push to production.
---

# Azure DevOps CI/CD for SAP

This skill helps you build, test, and deploy SAP systems reliably using Azure DevOps, automating transports, Fiori apps, and infrastructure provisioning.

## What This Skill Does

- **Azure Pipelines for SAP**: Design YAML pipelines for ABAP code deployment, SAP BTP applications, and Fiori frontends
- **gCTS Integration**: Leverage Git-based Change Transport System to connect Azure Repos to SAP systems
- **ABAP Unit Test Automation**: Run AUnit tests in CI/CD to catch regressions early
- **SAP BTP Deployments**: Deploy Cloud Foundry apps, build work zones, and manage subscriptions via pipeline
- **Fiori App Deployment**: Automate UI5 app builds, testing, and deployment to SAP fiori launchpads
- **Docker for SAP Testing**: Create containerized test environments, S/4HANA preview containers, or disposable development systems
- **Quality Gates**: Implement SonarQube scans, ABAP Code Inspector checks, and custom quality criteria before promoting to production
- **Branching Strategies**: Design GitFlow or trunk-based development that works with SAP change management
- **Release Management**: Orchestrate multi-system deployments (Dev → QA → Prod) with approval gates and rollback procedures
- **Infrastructure as Code**: Use Terraform or Bicep to provision SAP on Azure (VMs, load balancers, databases, networking)
- **Pipeline Health Monitoring**: Track pipeline success rates, deployment frequency, lead time for changes, and mean time to recovery

## How to Use This Skill

### Scenario: You're setting up a CI/CD pipeline for SAP ABAP development

1. **Ask about pipeline structure**: "Help me design an Azure DevOps pipeline for my SAP development team that includes ABAP unit tests, gCTS integration, and automated transports to QA."

2. **Request template code**: "Give me a YAML pipeline that runs AUnit tests, checks code quality with SonarQube, and triggers a gCTS import on our SAP system."

3. **Get Fiori deployment help**: "Walk me through setting up a Fiori app deployment pipeline that builds the app, runs tests, and publishes to our Fiori launchpad."

4. **Troubleshoot issues**: "My ABAP Code Inspector checks keep failing the pipeline. What quality thresholds should I set?"

5. **Plan infrastructure**: "Generate a Terraform configuration to provision an S/4HANA VM on Azure with proper networking and backup."

## Key Concepts

### Azure Pipelines YAML Structure for SAP
- **Triggers**: Monitor Azure Repos branches (main, develop, release branches)
- **Stages**: Separate build, test, quality, and deploy stages
- **Jobs**: Run in parallel (ABAP tests, UI5 builds, Terraform validation)
- **Tasks**: AzureCLI, PowerShell, Bash, or custom scripts calling SAP APIs
- **Approval Gates**: Manual approval before deploying to Prod, with stakeholder sign-off

### gCTS (Git-based Change Transport System)
- Connects your Git repo to SAP change requests and transports
- Pulls ABAP code from Git branches into your SAP system automatically
- Enables true DevOps: code review → Git merge → automatic SAP import
- Integrates with ABAP testing frameworks (AUnit, ZUnit)
- Supports branching strategies aligned with your deployment plan

### ABAP Unit Test Automation
- Use `ABAP Unit` (AUnit) or `zUnit` framework to write testable code
- Call `ABAP Test Cockpit (ATC)` or custom reports in your pipeline to run tests
- Fail the pipeline if test coverage drops or critical tests fail
- Example: Run tests with `FM: RS_ABAP_UNIT_EXECUTE` or `report SAUNIT_RUN`

### Quality Gates (SonarQube + ABAP Code Inspector)
- **SonarQube**: Scan ABAP code for maintainability, security, bugs; enforce gates before merging
- **ABAP Code Inspector**: Built-in SAP tool for static code analysis; integrate findings into your quality dashboard
- Set thresholds: e.g., "Pass only if code smells < 5, critical bugs = 0"
- Block promotions if quality drops compared to baseline

### Branching Strategy for SAP
- **GitFlow**: `main` (production) ← `release/*` ← `develop` ← feature branches
  - Aligns with SAP transport process (Dev → QA → Prod)
  - Each branch maps to a landscape
- **Trunk-Based**: Single `main` branch with feature toggles; less ceremony, faster feedback
  - Requires strong testing discipline and short-lived branches
  - Fits smaller teams or highly automated deployments

### Docker for SAP Testing
- Use SAP Docker images (S/4HANA Cloud SDK, Web IDE) to spin up test environments
- Run integration tests against a containerized SAP system
- Faster than provisioning real systems; disposable for each pipeline run
- Example: Deploy container, run tests, tear down in < 5 minutes

### Fiori App Deployment Pipeline
1. **Build**: `npm run build` or `npm run build:prod` for UI5 apps
2. **Test**: Run unit tests (Qunit), integration tests (OPA), E2E tests (Wdio/Cypress)
3. **Quality**: SonarQube scan of JavaScript/TypeScript code
4. **Package**: Create .zip or deploy to SAP Build Service
5. **Deploy**: Upload to SAP Fiori launchpad repository or Cloud Foundry
6. **Smoke Test**: Verify the app loads and basic flows work

### Release Management
- **Promotion Pipeline**: Automated promotion from Dev → QA when tests pass; manual approval for QA → Prod
- **Feature Toggles**: Deploy incomplete features behind toggles; enable in Prod without re-release
- **Blue-Green Deployment**: Keep old version live while new deploys; switch traffic after smoke tests
- **Canary Deployment**: Roll out to 10% of users first; monitor for errors; expand if healthy
- **Rollback Plan**: Store previous transport numbers; rollback procedure in runbook

### Infrastructure as Code (Terraform/Bicep)
- **Terraform for Azure**: Define SAP VM, database, networking, storage in HCL
  - Example: S/4HANA on Azure VM with 4+ sockets, 32GB+ RAM, managed disks, SQL Server
  - Integrate into pipeline: `terraform plan` in review, `terraform apply` in deploy stage
- **Bicep**: Azure's native IaC language; integrates with Azure DevOps ARM template tasks
  - Deploy resource groups, VNets, VMs, managed identities, key vaults
  - Parameterized for multiple environments (Dev/QA/Prod with different sizes)

### Monitoring Pipeline Health
- **Metrics**:
  - **Deployment Frequency**: How often you deploy (target: daily or multiple times per day)
  - **Lead Time for Changes**: Days from code commit to production (target: < 1 day)
  - **Mean Time to Recovery (MTTR)**: Time to fix failed deployments (target: < 1 hour)
  - **Change Failure Rate**: % of deployments that cause incidents (target: < 15%)
- **Dashboard**: Azure DevOps Analytics board; track success %, duration, failure reasons
- **Alerts**: Notify on pipeline failures, manual approvals pending, deployment delays
- **Logs**: Export pipeline logs to Application Insights or Log Analytics for deep analysis

## Practical Examples

### YAML Pipeline: ABAP Code + gCTS + Quality Gates
```yaml
trigger:
  branches:
    include:
    - main
    - develop
    - release/*

stages:
- stage: Build
  jobs:
  - job: CompileAndTest
    pool:
      vmImage: 'windows-latest'
    steps:
    - task: UsePythonVersion@0
      inputs:
        versionSpec: '3.9'
    - script: |
        pip install abapgit-connector  # Example
        python scripts/run_aunit_tests.py
      displayName: 'Run ABAP Unit Tests'
    - task: SonarQubePrepare@5
      inputs:
        SonarQube: 'SonarQube Connection'
        scannerMode: 'CLI'
        configMode: 'manual'
    - script: sonar-scanner -Dsonar.sources=src/abap
      displayName: 'SonarQube ABAP Scan'
    - task: SonarQubePublish@5
      inputs:
        pollingTimeoutSec: '300'

- stage: Quality
  dependsOn: Build
  condition: succeeded()
  jobs:
  - job: QualityGates
    pool:
      vmImage: 'windows-latest'
    steps:
    - task: SonarQubePublish@5
      inputs:
        pollingTimeoutSec: '300'
    - script: |
        if [ "$(SonarQubeQualityGatePassed)" != "true" ]; then
          echo "Quality gate failed. Blocking deployment."
          exit 1
        fi
      displayName: 'Check Quality Gate'

- stage: Deploy_QA
  dependsOn: Quality
  condition: succeeded()
  jobs:
  - job: gCTSImport
    pool:
      vmImage: 'ubuntu-latest'
    steps:
    - task: AzureCLI@2
      inputs:
        azureSubscription: 'Azure Connection'
        scriptType: 'bash'
        scriptLocation: 'inlineScript'
        inlineScript: |
          python scripts/trigger_gcts_import.py \
            --system QA \
            --branch develop \
            --credentials $(SAP_QA_USER) $(SAP_QA_PASSWORD)
      displayName: 'Trigger gCTS Import to QA'

- stage: Deploy_Prod
  dependsOn: Deploy_QA
  condition: succeeded()
  jobs:
  - job: WaitForApproval
    pool: server
    displayName: 'Approval Gate'
    steps:
    - task: ManualValidation@0
      inputs:
        notifyUsers: 'release-manager@company.com'
        instructions: 'Review QA tests and approve for production deployment'
  - job: ProdDeployment
    dependsOn: WaitForApproval
    condition: succeeded()
    pool:
      vmImage: 'ubuntu-latest'
    steps:
    - script: |
        python scripts/trigger_gcts_import.py \
          --system PROD \
          --branch main \
          --credentials $(SAP_PROD_USER) $(SAP_PROD_PASSWORD)
      displayName: 'Deploy to Production via gCTS'
```

### Terraform: S/4HANA VM on Azure
```hcl
provider "azurerm" {
  features {}
}

resource "azurerm_resource_group" "sap" {
  name     = "rg-sap-prod"
  location = "East US"
}

resource "azurerm_virtual_network" "sap" {
  name                = "vnet-sap"
  resource_group_name = azurerm_resource_group.sap.name
  location            = azurerm_resource_group.sap.location
  address_space       = ["10.0.0.0/16"]
}

resource "azurerm_subnet" "sap_subnet" {
  name                 = "subnet-sap"
  resource_group_name  = azurerm_resource_group.sap.name
  virtual_network_name = azurerm_virtual_network.sap.name
  address_prefixes     = ["10.0.1.0/24"]
}

resource "azurerm_network_interface" "sap_nic" {
  name                = "nic-sap"
  resource_group_name = azurerm_resource_group.sap.name
  location            = azurerm_resource_group.sap.location

  ip_configuration {
    name                          = "ipconfig1"
    subnet_id                     = azurerm_subnet.sap_subnet.id
    private_ip_address_allocation = "Static"
    private_ip_address            = "10.0.1.10"
  }
}

resource "azurerm_windows_virtual_machine" "sap_vm" {
  name                = "vm-s4hana-prod"
  resource_group_name = azurerm_resource_group.sap.name
  location            = azurerm_resource_group.sap.location
  size                = "Standard_E8s_v3"  # 8 vCPU, 64GB RAM

  admin_username = "sap_admin"
  admin_password = var.vm_password  # Use Azure Key Vault

  network_interface_ids = [azurerm_network_interface.sap_nic.id]

  os_disk {
    caching           = "ReadWrite"
    storage_account_type = "Premium_LRS"
  }

  source_image_reference {
    publisher = "SUSE"
    offer     = "sles-sap-15-sp5"
    sku       = "gen2"
    version   = "latest"
  }

  tags = {
    Environment = "Production"
    System      = "S/4HANA"
  }
}

variable "vm_password" {
  sensitive = true
}

output "vm_private_ip" {
  value = azurerm_windows_virtual_machine.sap_vm.private_ip_address
}
```

### Bicep: Deploy SAP Monitoring Infrastructure
```bicep
param location string = resourceGroup().location
param environment string = 'prod'

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: 'sa${uniqueString(resourceGroup().id)}'
  location: location
  sku: {
    name: 'Standard_GRS'
  }
  kind: 'StorageV2'
}

resource logAnalyticsWorkspace 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: 'law-sap-${environment}'
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: 'appi-sap-${environment}'
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalyticsWorkspace.id
  }
}

output storageAccountName string = storageAccount.name
output logAnalyticsId string = logAnalyticsWorkspace.id
output appInsightsKey string = appInsights.instrumentationKey
```

## Integration Points

- **Azure DevOps**: Repos, Pipelines, Artifacts, Test Plans
- **SAP Systems**: ABAP via ADT, SAP BTP, Fiori launchpad, S/4HANA
- **Azure Services**: VMs, SQL Database, App Service, Container Registry, Key Vault
- **Third-Party Tools**: SonarQube, Docker, Terraform, Git
- **Monitoring**: Application Insights, Log Analytics, Azure DevOps Analytics

## Common Pitfalls & Solutions

| Problem | Solution |
|---------|----------|
| gCTS imports fail silently | Enable debug logging in ADT; monitor SAP change request status in SE09 |
| Pipeline takes 45+ minutes | Parallelize stages; cache build artifacts; use self-hosted agents with SSDs |
| Quality gate blocks too often | Review thresholds; adjust baseline for legacy code; educate team on standards |
| Fiori tests flaky | Use headless browser; add retry logic; mock backend calls |
| Terraform drift in Prod | Run `terraform plan` nightly; use policy-as-code (Azure Policy) to enforce compliance |

## Next Steps

1. **Assess current state**: Audit your SAP systems; document current deployment process
2. **Set up Azure DevOps**: Create project, repos, build pipelines with basic structure
3. **Integrate gCTS**: Enable in your SAP system; test Git-to-SAP connection
4. **Build quality gates**: Implement SonarQube, Code Inspector checks; define thresholds
5. **Automate tests**: Write AUnit tests; integrate into pipeline; block on failures
6. **Plan rollout**: Start with Dev landscape; expand to QA and Prod with approval gates
7. **Monitor & improve**: Track metrics; optimize pipeline duration; gather team feedback

---

**Keywords**: Azure DevOps, SAP CI/CD, Azure Pipelines, gCTS, ABAP unit tests, Fiori deployment, Docker, SonarQube, Code Inspector, Terraform, Bicep, release management, infrastructure as code, quality gates, branching strategy, S/4HANA, SAP on Azure.
