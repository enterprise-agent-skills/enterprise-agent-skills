---
name: power-platform-sap
title: Power Platform + SAP Integration
description: Master integrations between Microsoft Power Platform and SAP systems. Build approval workflows, dashboards, and automation using Power Apps, Power Automate, Power BI, and Copilot Studio with SAP connectors and data sources.
category: Integration
triggers:
  - Power Apps SAP
  - Power Automate SAP
  - Power BI SAP
  - Copilot Studio SAP
  - Power Platform
  - SAP connector
  - on-premises data gateway
  - SAP approval workflow
  - SAP integration
  - Power Pages SAP
  - Dataverse SAP
keywords:
  - Power Apps
  - Power Automate
  - Power BI
  - Copilot Studio
  - Power Pages
  - Dataverse
  - SAP
  - SAP HANA
  - SAP BW/4HANA
  - on-premises data gateway
  - RFC
  - BAPI
  - IDoc
  - approval workflow
  - Azure Logic Apps
  - Azure AD
---

# Power Platform + SAP Integration

Master the integration between Microsoft Power Platform and SAP systems. This skill covers building cloud-connected applications, dashboards, automation flows, and AI-powered chatbots that work seamlessly with your SAP data.

## Core Components

### Power Apps + SAP Connector

**On-Premises Data Gateway Setup**
- Install and configure the on-premises data gateway on a machine with SAP system access
- Gateway requirements: Windows Server 2016 or later, minimum 4GB RAM, stable network connection
- Register gateway in Power Platform admin center and assign to the appropriate environment
- Create a new SAP connection using the gateway resource
- Test connectivity with `ping` and network diagnostics before deployment

**Building Canvas Apps**
- Connect Power Apps to SAP using the SAP connector (requires on-premises gateway)
- Use SAP RFC functions and BAPIs directly in your app logic
- Examples: BAPI_PURCHASE_ORDER_CREATE, BAPI_PO_GETDETAIL, RFC_READ_TABLE
- Leverage galleries and forms to display SAP data with real-time updates
- Implement offline mode with data refresh on connection

**Model-Driven Apps for Master Data**
- Create Dataverse tables mapped to SAP master data (materials, vendors, customers)
- Use server-side syncing or Azure Logic Apps to keep data synchronized
- Build views, forms, and charts for SAP data management
- Implement business process flows for SAP workflows (approval chains, status tracking)
- Enable Power BI analytics on top of Dataverse

---

### Power Automate Flows with SAP

**RFC and BAPI Invocations**
- Use the SAP connector to call RFC function modules directly
- Common scenarios: Create purchase orders, read material master data, update invoice status
- Structure RFC parameters: Import, Export, Tables, and Exceptions
- Handle SAP exceptions and errors with try-catch logic in Power Automate
- Implement retry logic for transient failures (network, temporary locks)

**IDoc Triggers**
- Set up IDoc listener flows triggered by SAP outbound IDocs (ORDERS, INVOIC, MATMAS)
- Parse IDoc segments and fields into structured data
- Route IDoc data to multiple downstream systems (Power BI, Dataverse, SharePoint)
- Create acknowledgment IDocs back to SAP on successful processing
- Monitor IDoc processing with error logging and notifications

**Approval Workflow Automation**
- Build purchase order approval flows triggered by SAP BAPI calls
- Route approvals through Teams adaptive cards with action buttons
- Update SAP workflow status (approval/rejection) upon completion
- Cascade approvals through multiple approval stages based on amount or department
- Send notifications to SAP-integrated Teams channels

---

### Power BI + SAP Integration

**DirectQuery Mode**
- Connect Power BI to SAP HANA, SAP BW, or SAP ECC using DirectQuery
- DirectQuery benefits: Real-time data, reduced storage, live query execution
- Performance considerations: Query optimization, measure folding, aggregations
- Build reports with filtered views to limit data transferred from SAP
- Use query folding to push filtering to SAP backend

**Import Mode**
- Import SAP data into Power BI using scheduled refreshes
- Use Power Query to extract, transform, and load (ETL) SAP data
- Schedule refreshes during off-peak SAP periods to minimize impact
- Implement incremental refresh for large datasets
- Leverage Power BI Premium for large volumes and frequent refreshes

**SAP BW/4HANA Connectors**
- Connect to SAP BW InfoProviders, InfoCubes, and aggregation levels
- Query SAP BW using characteristics, key figures, and restricted key figures
- Access SAP BW analytic queries and InfoViews directly
- Filter on SAP BW characteristics (company code, cost center, plant)
- Build dashboards combining BW data with other Power BI sources

**SAP HANA DirectQuery**
- Connect Power BI directly to SAP HANA database with native performance
- Query HANA calculation views, tables, and virtual tables
- Use HANA SQL queries for advanced analytics
- Implement row-level security (RLS) based on SAP user dimensions
- Monitor HANA connection performance and optimize query execution

**Common Dashboard Patterns**
- SAP financial dashboard: GL balances, AR/AP aging, cash flow
- SAP operations: Inventory levels, procurement status, production schedules
- SAP sales: Revenue by customer/product, order pipeline, sales performance
- SAP HR: Headcount analytics, payroll trends, workforce planning

---

### Copilot Studio + SAP Scenarios

**Employee Self-Service Bots**
- Build copilot for employee leave requests, expense reports, or travel bookings
- Integrate with SAP SuccessFactors for leave balances and approvals
- Query SAP ECC for cost center and manager information
- Provide chatbot responses with real-time SAP data
- Escalate complex requests to human agents in Teams

**Procurement Chatbot**
- Enable employees to check purchase order status directly in Teams
- Query SAP for PO details, delivery schedules, and invoice status
- Allow creation of purchase requisitions through conversational interface
- Route requisitions to approval workflow in Power Automate
- Provide procurement analytics and spend insights

**Inventory Lookup Bot**
- Real-time inventory searches across SAP warehouse locations
- Suggest alternative materials or suppliers based on stock availability
- Alert on low-stock items and trigger reorder points
- Integrate with demand planning data from Power BI
- Enable quick decision-making on fulfillment options

**AI-Powered Insights**
- Leverage Copilot with Copilot Extensions to pull SAP data on demand
- Summarize SAP reports (sales, inventory, finance) in natural language
- Provide anomaly detection on SAP metrics
- Generate recommendations based on SAP trends and patterns

---

### Power Pages with SAP Data

**Portal Architecture**
- Create public or authenticated Power Pages connected to SAP
- Use Dataverse tables as middleware between SAP and portal visitors
- Implement portal pages for customer self-service (order status, invoicing, technical support)
- Enable suppliers to submit invoices, quotations, or quality reports
- Build employee portals for HR processes (benefits, timesheets, training)

**Common Scenarios**
- Customer Portal: Order history, shipping status, invoice download, payment terms
- Supplier Portal: Invoice submission, PO acknowledgment, shipment tracking, performance metrics
- Employee Portal: Leave balance, expense claims, benefits enrollment, training catalog
- Partner Portal: Sales pipeline visibility, lead management, co-selling opportunities

**Data Synchronization**
- Use Power Automate to sync portal submissions back to SAP
- Implement Dataverse plugins for real-time updates to SAP master data
- Handle data validation and error notification to portal users
- Maintain audit trails for regulatory compliance

---

### Dataverse as Middleware

**SAP-Dataverse Synchronization**
- Create Dataverse tables reflecting SAP master data (customers, materials, vendors, GL accounts)
- Use Power Automate or Logic Apps to sync data bidirectionally
- Implement data transformation and validation rules
- Handle SAP lookups and master data hierarchies in Dataverse
- Monitor synchronization status and error logging

**Benefits of Dataverse Integration**
- Enable offline-first Power Apps experiences with SAP data
- Leverage Dataverse plugins and workflows for business logic
- Use Dataverse data for analytics, auditing, and compliance
- Integrate with Microsoft 365 (Teams, SharePoint, Outlook) seamlessly
- Scale to millions of records with enterprise-grade performance

---

### Canvas Apps for SAP Approvals

**Purchase Order Approval App**
- Display SAP purchase orders pending approval
- Show PO details: vendor, items, amounts, delivery schedule
- Implement approval/rejection actions with comments
- Update SAP workflow status through BAPI on approval action
- Notify PO requester and manager through adaptive cards

**Purchase Requisition App**
- Enable employees to create PRs directly in Power Apps
- Pre-fill company code, cost center, and division from Azure AD
- Search SAP material master for product selection
- Validate available budget against SAP cost center master
- Submit PR to SAP and track approval status

**Leave Request App**
- Query SAP SuccessFactors or HCM for employee leave balance
- Allow employees to request leave with calendar interface
- Route requests through approval chain via Power Automate
- Update SAP leave records on approval
- Display approved, pending, and rejected leaves

**Invoice Approval App**
- Fetch pending invoices from SAP for approval
- Display invoice scans and supporting documents
- Flag discrepancies (quantity, amount, delivery vs. PO)
- Approve, reject, or request additional info
- Update SAP invoice status and trigger payment process

---

### Model-Driven Apps for SAP Master Data

**Material Master Management**
- Dataverse tables for material master (MARA, MARC, MARD)
- Forms for creating/editing materials with SAP-specific fields
- Business process flows: Create → Approval → Synchronize to SAP
- Bulk import/export with Excel integration
- Audit trail and change tracking

**Customer Master Management**
- Dataverse customer table synced with SAP (KNA1)
- Forms for customer details, billing/shipping addresses, payment terms
- Business process flow: New Customer → Credit Check → SAP Sync
- Integration with Dynamics 365 Sales for CRM functionality
- Partner hierarchy and relationship management

**Vendor Master Management**
- Dataverse vendor table aligned with SAP (LFA1)
- Forms for vendor details, contact info, payment terms, certifications
- Vendor evaluation scoring and performance tracking
- Duplicate detection to prevent SAP data conflicts
- Workflow for vendor onboarding and approval

---

### Azure Logic Apps as Bridge

**Why Logic Apps?**
- Extended connectivity beyond Power Platform: REST APIs, webhooks, FTP, SFTP
- Complex workflow orchestration with conditional logic and loops
- Scheduled tasks and recurrence patterns
- Enterprise-grade error handling and retry policies

**Common Patterns**
- SAP data → Logic Apps → Azure Storage/Data Lake for archival
- Scheduled SAP extracts: Run nightly RFC, process results, load to Power BI
- Event-driven automation: SAP IDoc → Logic App → Send email → Create Teams message
- Data validation and cleansing: Pull from SAP, validate, enrich, write back
- Third-party integration: SAP ↔ Logic Apps ↔ Salesforce/Netsuite/Workday

**Logic Apps + SAP Connector**
- Use SAP connector in Logic Apps with on-premises gateway
- Call RFC modules, trigger on IDocs, execute BAPIs
- Parse SAP responses into structured data
- Compose payloads for downstream systems (Salesforce, Oracle, etc.)
- Implement complex error handling and compensating transactions

---

## Security Best Practices

### Azure AD Integration
- Link Power Platform users to Azure AD for seamless SSO
- Use Azure AD groups for Power Apps, Power Automate, and Power BI access control
- Implement conditional access policies for sensitive SAP apps
- Enforce multi-factor authentication (MFA) for critical workflows
- Audit Azure AD sign-in logs for suspicious activity

### SAP Principal Propagation
- Configure principal propagation to pass Azure AD identity to SAP
- Ensure SAP user exists in SAP system matching Azure AD user
- Leverage SAP role-based access control (RBAC) from Power Platform
- Reduce need for separate service accounts and shared credentials
- Enable audit trail of actions with actual user identity in SAP

### On-Premises Data Gateway Security
- Use managed identities or service accounts for gateway authentication
- Implement network segmentation: gateway on separate network from SAP
- Enable encryption in transit (HTTPS, TLS) for gateway communication
- Monitor gateway logs for failed connections and security events
- Regularly update gateway to latest version for security patches
- Restrict gateway access to authorized Power Platform users only

### SAP Connector Authentication
- Use SAP system user account with minimal required permissions
- Implement SAP authorization checks at BAPI/RFC level
- Avoid hardcoding credentials: use Azure Key Vault for secret management
- Enable SAP system change logging (CDHDR/CDPOS tables)
- Review SAP security audit logs (SM20) for unauthorized access attempts

### Power Platform Security
- Enable data loss prevention (DLP) policies to control SAP data flow
- Use row-level security (RLS) in Power BI for sensitive SAP data
- Implement column-level security in model-driven apps
- Restrict Power Apps sharing to specific Azure AD groups
- Enable audit logging for all Power Platform activities

---

## Common Integration Patterns

### Pattern 1: SAP PO Approval in Teams
1. SAP workflow sends IDoc to Power Automate
2. Power Automate creates adaptive card in Teams approval channel
3. Manager approves/rejects in Teams
4. Power Automate calls BAPI_PO_CHANGE to update SAP status
5. Teams notification confirms SAP status change

**Implementation Steps:**
- Set up SAP outbound IDoc (ORDERS or EKBE) to Power Automate webhook
- Parse IDoc segments into PO details (vendor, amount, items)
- Create Teams approval flow with amount thresholds
- Use BAPI_PO_CHANGE for status update and BAPI_PURCHASE_ORDER_GETDETAIL for verification
- Log all approvals in Dataverse for audit trail

### Pattern 2: SAP Inventory Lookup in Power Apps
1. Employee opens Power Apps on mobile or web
2. Search by material number or description
3. Power Apps calls RFC_READ_TABLE to fetch inventory from SAP
4. Displays stock levels across warehouses
5. Shows replenishment status and delivery dates

**Implementation Steps:**
- Build canvas app with search box and inventory gallery
- Use SAP connector with on-premises gateway
- Call RFC_READ_TABLE targeting MARD (material warehouse) table
- Filter by warehouse, material type, and quantity thresholds
- Add offline mode with cached data for field sales scenarios

### Pattern 3: SAP Dashboard in Power BI
1. Power BI connects to SAP HANA or BW (DirectQuery or Import)
2. Dashboard shows real-time GL balances, AR aging, inventory levels
3. Users drill down by plant, cost center, or material
4. Row-level security restricts data to user's assigned cost centers
5. Refresh schedule syncs with SAP posting periods

**Implementation Steps:**
- Design fact and dimension tables in Power BI
- Use Power Query to extract and transform SAP data
- Implement hierarchies (company → division → plant → department)
- Add slicers for period, cost center, and material filters
- Schedule refresh during SAP maintenance windows

### Pattern 4: SAP Approval in Power Apps + Teams
1. User submits purchase requisition in Power Apps
2. Power Automate captures form data and validates against SAP
3. Routes approval through Teams based on amount and department
4. On approval, creates PR in SAP via BAPI_PR_CREATE
5. Power Apps shows approval status and SAP document number

**Implementation Steps:**
- Design PR form in canvas app with validation rules
- Implement cost center lookup from SAP
- Create multi-stage approval flow in Power Automate
- Call BAPI_PURCHASE_REQUISITION_CREATE on final approval
- Sync PR status back to Power Apps using SAP connector

### Pattern 5: Supplier Portal for Invoice Submission
1. Supplier logs into Power Pages with Azure AD B2B or community portal access
2. Submits invoice with document upload and line items
3. Power Automate validates against PO in SAP
4. On validation, creates MIRO (Goods Receipt/Invoice Receipt) in SAP
5. Supplier receives invoice status updates via email

**Implementation Steps:**
- Design portal pages for invoice upload and status tracking
- Implement document storage in SharePoint with virus scanning
- Use Power Automate to call BAPI_BILLDOC_GETLIST for PO validation
- Create MIRO via BAPI_BILLDOC_CREATE on validation
- Set up notification templates for invoice status updates

---

## Advanced Topics

### SAP Change Data Capture
- Use SAP system change logs (CDHDR, CDPOS) to trigger Power Automate flows
- Detect changes to key tables (sales orders, invoices, materials) in real-time
- Trigger downstream processes: update Power BI, notify Copilot, sync to Dataverse
- Implement change data capture (CDC) pattern for initial load sync

### Handling Large SAP Datasets
- Use RFC_READ_TABLE with WHERE clauses to filter at SAP level
- Implement pagination for large result sets
- Leverage SAP table TLOG for archival of historical data
- Consider SAP Data Services (SLT) for near-real-time replication
- Use Power BI aggregations for pre-calculated summaries

### Handling SAP Exceptions and Errors
- Map SAP return codes and exception messages to user-friendly messages
- Implement retry logic with exponential backoff for transient errors
- Log all errors to Dataverse with timestamp, user, and action details
- Alert on critical failures (payment processing, inventory deduction)
- Create escalation workflows for unrecoverable errors

### Performance Optimization
- Cache SAP lookups in Power Apps (materials, vendors, cost centers)
- Use SAP indexes on frequently filtered tables (MARA, KNA1, LFA1)
- Minimize network round-trips: batch RFC calls where possible
- Monitor on-premises gateway performance and network latency
- Implement query optimization in Power BI with aggregations

---

## Learning Resources

### Microsoft Documentation
- Power Apps SAP connector: https://learn.microsoft.com/en-us/connectors/sap/
- Power Automate RFC and BAPI calls: https://learn.microsoft.com/en-us/power-automate/flow-designer
- Power BI SAP HANA connector: https://learn.microsoft.com/en-us/power-bi/connectors/sap/
- Power Pages: https://learn.microsoft.com/en-us/power-pages/

### SAP Resources
- SAP RFC Function Modules: BAPI_PURCHASE_ORDER_*, BAPI_MATERIAL_GET_DETAIL
- SAP IDocs: ORDERS01, INVOIC01, MATMAS01
- SAP Authorization: PFCG roles, authorization objects
- SAP Change Logs: Tables CDHDR, CDPOS

### Best Practices
- Implement least-privilege access in SAP user roles
- Test all flows in SAP sandbox (DEV/QA) before production
- Document BAPI parameters and return codes in Wiki
- Monitor on-premises gateway health and connectivity
- Schedule reviews of power platform security settings quarterly

---

## Support and Troubleshooting

**Gateway Connection Issues**
- Verify gateway status in Power Platform admin center
- Check network connectivity from gateway machine to SAP system
- Review gateway logs: "C:\ProgramData\Microsoft\On-premises data gateway\GatewayLogs"
- Ensure SAP firewall allows inbound connections on RFC port (typically 32xx)
- Restart gateway service and retry

**RFC/BAPI Execution Errors**
- Validate BAPI parameters against SAP documentation (SE37 transaction)
- Check SAP user authorization for the BAPI (SE38 for RFCs)
- Review SAP application logs (SM21) for detailed error messages
- Test BAPI execution directly in SAP (SE37) before Power Platform testing
- Implement error message parsing to surface SAP exception details to users

**Power BI Connectivity**
- Test DirectQuery connection in Power BI Desktop before publishing
- Monitor SAP system performance during Power BI queries (ST03 transaction)
- Check SAP authentication (user lockout, password expiry)
- Verify database privileges for Power BI service account
- Use Power BI performance analyzer to identify slow queries

**Power Apps Performance**
- Profile Power Apps with Monitor tool to identify slow operations
- Cache frequently accessed SAP data in collections
- Use delegation-friendly queries in galleries and filters
- Minimize SAP connector calls by batching operations
- Test app performance on target devices (mobile, tablet)

---

## Getting Started

1. **Assess Your SAP System**: Inventory RFCs, BAPIs, and IDocs you plan to use
2. **Prepare Infrastructure**: Install on-premises gateway, configure network access
3. **Design Security Model**: Define Azure AD groups, SAP roles, and data access rules
4. **Build Pilot**: Start with one simple use case (e.g., inventory lookup)
5. **Test Thoroughly**: Validate in SAP sandbox before production deployment
6. **Monitor and Optimize**: Track gateway performance, review usage patterns, optimize queries
7. **Scale Gradually**: Expand to additional workflows and applications based on learnings

