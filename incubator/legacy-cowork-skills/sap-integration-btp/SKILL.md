---
name: SAP Integration BTP
description: >-
  SAP integration scenarios using SAP BTP, Cloud Integration (CPI), API Management, 
  Event Mesh, Cloud Connector, and Azure/M365 integration patterns. Covers iFlows, 
  adapters, RFC/BAPI/IDoc integration, principal propagation, error handling, monitoring, 
  and common scenarios like S/4HANA to Azure, BTP to M365, and SAP to Teams.
aliases:
  - sap integration
  - sap btp
  - cpi
  - iflow
  - sap connector
  - event mesh
  - api management
  - rfc
  - idoc
  - cloud connector
  - sap to azure
  - sap to teams
  - sap graph api
  - build process automation
  - principal propagation
  - sso
triggers:
  - "SAP integration"
  - "CPI"
  - "iFlow"
  - "BTP"
  - "Event Mesh"
  - "SAP connector"
  - "RFC"
  - "IDoc"
  - "API management"
  - "cloud connector"
  - "SAP to Azure"
  - "SAP to Teams"
  - "Cloud Integration"
  - "Advanced Event Mesh"
  - "SAP Graph API"
  - "Build Process Automation"
  - "Principal propagation"
  - "Azure AD integration"
version: 1.0.0
icon: "⚙️"
category: "Integration"
tags:
  - "sap"
  - "btp"
  - "cloud-integration"
  - "api-management"
  - "event-mesh"
  - "azure"
  - "m365"
  - "microsoft-power-automate"
  - "middleware"
  - "eai"
---

# SAP Integration BTP Skill

Your comprehensive guide to SAP enterprise integration using SAP Business Technology Platform (BTP), Cloud Integration, API Management, and Azure/Microsoft 365 connectivity.

## Overview

This skill covers modern SAP integration patterns and best practices for:
- **SAP Cloud Integration (CPI)**: iFlows, adapters, message mapping, pre-built content
- **API Management**: Secure APIs, API gateways, policy enforcement, developer portals
- **Event Mesh**: Asynchronous messaging, event-driven architectures, pub/sub patterns
- **Cloud Connector**: On-premise connectivity, Kerberos authentication, TCP tunneling
- **Azure Integration**: Logic Apps SAP connector, Azure API Management, Azure Service Bus
- **Microsoft Power Automate**: Cloud flows, desktop flows, SAP connectors, approval workflows
- **SAP Graph API**: Unified data access, real-time queries, events and notifications
- **Build Process Automation**: Low-code process modeling with SAP integration
- **RFC/BAPI/IDoc**: Traditional SAP backend connectivity patterns
- **Security**: Principal propagation, Azure AD SSO, OAuth 2.0, X.509 certificates
- **Monitoring**: Alert notifications, message tracing, performance analysis

---

## 1. SAP Cloud Integration (CPI) - iFlows

### Core Concepts

**What is an iFlow?**
- Integration process definition combining trigger, steps (adapters, mappings, logics), and endpoints
- Deployed as packages in Cloud Integration tenant
- Supports both synchronous and asynchronous patterns
- Monitoring and message tracing built-in

### iFlow Patterns

#### Request-Reply (Synchronous)
```
Sender Adapter → Message Mapping → Receiver Adapter → Response
- HTTP, SFTP, OData adapters trigger
- Ideal for real-time queries, BAPI calls
- Timeout considerations (default 10 minutes)
- Error handling with exception subprocess
```

#### Fire & Forget (Asynchronous)
```
Sender Adapter → Message Mapping → Receiver Adapter (no response)
- Decouples sender and receiver
- Use for data synchronization, logging
- Implement idempotency for retries
- Message Queue for persistence
```

#### Batch Processing
```
Scheduler → Split (N items) → Process in parallel → Aggregate → Send
- Configure splitter to split batches
- Use parallel process to increase throughput
- Aggregator to combine responses
- Example: Bulk BAPI calls, bulk data loads
```

#### Event-Driven (via Event Mesh)
```
Event Mesh Publish → iFlow Subscribe → Process → Receiver
- Publish events to topics
- Multiple iFlows subscribe independently
- Parallel execution, loose coupling
- Common for S/4HANA events, master data changes
```

### Adapters Overview

#### Receiver Adapters (Outbound)

| Adapter | Use Case | Key Features |
|---------|----------|--------------|
| **RFC** | Call SAP RFC functions | Connection pool, context ID, queue name |
| **BAPI** | Call SAP business APIs | SAP transaction support, serialization |
| **IDoc** | Send SAP IDocs | EDI message format, acknowledgments |
| **SOAP** | Call SOAP web services | WSDL-based, WS-Security, WS-Addressing |
| **OData** | Access OData APIs | CRUD operations, batch processing, filtering |
| **REST** | Call REST APIs | HTTP methods, content negotiation, SSL |
| **HTTP** | Generic HTTP calls | Basic auth, OAuth, client certificates |
| **File** | Write files to SFTP/local | Directory watch, file polling, archiving |
| **Mail** | Send emails | SMTP, attachments, templating |
| **JMS** | Messaging queues | Topic/queue, correlation IDs, transactions |
| **Kafka** | Event streaming | Topics, partitioning, offset management |
| **Azure Service Bus** | Azure integration | Queues, topics, sessions, dead-letter |

#### Sender Adapters (Inbound)

| Adapter | Trigger | Configuration |
|---------|---------|----------------|
| **HTTP** | REST POST/GET | Authentication, polling, content types |
| **SOAP** | SOAP requests | WSDL generation, security headers |
| **Scheduler** | Time-based trigger | Cron expressions, time zones, frequency |
| **File Poller** | File arrival | Directory path, read locks, filename patterns |
| **OData** | OData query polling | Resource path, filter conditions, pagination |
| **JMS** | Queue/topic subscription | Queue names, selectors, transaction handling |
| **Kafka** | Topic subscription | Consumer group, offset, partitioning |
| **Mail** | Email polling | IMAP/POP3, folder, attachment handling |
| **AS2** | EDI exchanges | Certificate-based, receipts, compression |
| **SFTP** | SFTP polling | Hostname, private key auth, file patterns |

### Message Mapping

#### Types of Mapping

**1. XSLT Mapping**
- XPath expressions, templates
- Best for complex XML transformations
- Performance overhead vs graphical mapping

**2. Graphical Mapping**
- Visual drag-drop interface
- Functions: String manipulation, math, date, custom
- Lookups: Database, table, ValueMapping
- Context-aware mapping (loops, conditionals)

**3. Custom Mapping**
- Groovy script: Full programming logic, libraries
- Java UDF: Custom functions, compiled performance
- Message body access: `message.getBody()`

#### Common Mapping Scenarios

**Map SAP BAPI Response to REST JSON**
```
Input: BAPI XML response
<BAPIRET2List>
  <item>
    <TYPE>S</TYPE>
    <MESSAGE>Order created</MESSAGE>
    <OBJECT_ID>ORD-123</OBJECT_ID>
  </item>
</BAPIRET2List>

Output: REST JSON
{
  "success": true,
  "orderId": "ORD-123",
  "message": "Order created"
}

Mapping:
- BAPIRET2List/item[TYPE='S'] → success=true
- BAPIRET2List/item/OBJECT_ID → orderId
- BAPIRET2List/item/MESSAGE → message
```

**Flatten Nested SAP Structure**
```
Input: Nested purchase order
PurchaseOrder/
  Header/OrderNo
  Header/Customer
  Items/LineItem[]/Material
  Items/LineItem[]/Qty

Output: Flat CSV
OrderNo,Customer,Material,Qty
PO-123,Acme,MAT-001,100
```

**Enrich with Lookup**
```
Input: Product ID
Process: Lookup product master from SAP
Output: Product ID + Name + Price + Availability
Requires: ValueMapping or database lookup
```

### Message Sequencing and Idempotency

**Prevent Duplicate Processing**
```
1. Add unique message ID (UUIDGenerator function)
2. Database persistence pattern
3. Store processed IDs in database/cache
4. Check before processing: Skip if exists
5. Implement with Groovy script or custom step
```

**Correlation ID Pattern**
```
- Generate or extract correlation ID from request
- Pass through entire flow
- Log in error messages, monitoring
- Trace related messages across systems
```

### Pre-built Content & Integration Packages

**Access iFlow Templates**
- SAP provides integration packages for common scenarios
- Available in SAP Integration Suite Discover tab
- Pre-built adapters, mappings, error handling
- Customize for your specific needs

**Popular Packages**
- SAP S/4HANA connector scenarios
- SAP SuccessFactors employee data sync
- SAP Ariba procurement integration
- SAP Analytics Cloud data loading
- SAP Concur expense management

---

## 2. SAP Advanced Event Mesh Patterns

### Event Mesh Architecture

**Terminology**
- **Topic**: Named channel for events (e.g., `sap.s4.beh.purchaseorder.v1.PurchaseOrder.Created`)
- **Queue**: Durable subscription to topics
- **Event Source**: SAP system publishing events
- **Event Consumer**: Application subscribing to events
- **Broker**: Cloud-hosted message broker (Solace, SAP Event Mesh)

### Event-Driven Integration Patterns

#### 1. Event Publisher to Event Consumer via Topic

```
S/4HANA Event → Event Mesh Topic → Multiple Consumers (in parallel)
- Event source emits: Material created, PO status changed, Invoice received
- Multiple iFlows subscribe independently
- Loose coupling, scalability
- Guaranteed delivery, ordering per topic partition
```

**Setup Steps:**
1. Enable events in SAP S/4HANA (OData event enablement)
2. Create Event Mesh instance (standard/enterprise plan)
3. Configure authentication (OAuth 2.0 client credentials)
4. Create topic and queue in Event Mesh
5. Subscribe iFlow Kafka adapter to topic
6. Deploy and test

#### 2. Aggregation Pattern with Event Correlation

```
Multiple Events → Aggregator iFlow → Single Business Process
Example: Order fulfillment
  Event 1: Order placed
  Event 2: Payment confirmed
  Event 3: Inventory reserved
  → Trigger: Logistics process only when ALL received within timeframe
```

**Implementation:**
- Use Kafka topic for events
- iFlow with Aggregator pattern
- Store partial events in database
- Trigger business process on complete aggregation
- Timeout for incomplete orders (e.g., 1 hour)

#### 3. Event Transformation and Enrichment

```
Raw Event → Transform to Standard Schema → Enrich with Context → Publish to Domain Topic
```

**Example: Enrich S/4HANA event**
```json
Input Event:
{
  "PurchaseOrderNo": "PO-123",
  "EventType": "Created"
}

After Enrichment:
{
  "PurchaseOrderNo": "PO-123",
  "EventType": "Created",
  "CustomerName": "Acme Corp",  // From lookup
  "TotalAmount": "10000 USD",   // From BAPI
  "ProcessID": "xyz789",         // Context
  "Timestamp": "2024-04-11T10:30:00Z"
}
```

#### 4. Retry and Dead-Letter Queue Pattern

```
Main Topic → Process → Success: ACK
                    → Failure: Retry (3 times)
                                  → Still failing: Move to DLQ
                                  → Alert ops, manual review
```

**Configuration:**
- Kafka topic: auto-retries, configurable partition
- Max retry count before DLQ
- DLQ processing: manual review, alerting, re-injection
- Implementation in iFlow: Error subprocess sends to DLQ topic

### SAP S/4HANA Events

**Native Events Published**
- **Business Partner**: Created, changed, deleted
- **Material Master**: Created, deleted, changed
- **Purchase Order**: Created, changed, cancelled, confirmed, goods receipt
- **Sales Order**: Created, cancelled, confirmed
- **Invoice**: Created, cancelled, posted
- **Financial Document**: Posted, reversed
- **Stock Transfer**: Created, received

**Event Schema Structure**
```json
{
  "id": "event-id-uuid",
  "source": "s4-hc://s4-system/erpinstance",
  "specversion": "1.0",
  "type": "sap.s4.beh.purchaseorder.v1.PurchaseOrder.Created",
  "datacontenttype": "application/json",
  "subject": "PurchaseOrder",
  "time": "2024-04-11T10:30:00Z",
  "data": {
    "PurchaseOrder": "PO-123",
    "CompanyCode": "1000",
    "VendorNumber": "V-001"
  }
}
```

### Monitoring Event Mesh

- **Queue Depth**: Messages waiting for consumption
- **Event Throughput**: Messages/second
- **Latency**: Time from publish to process
- **Dead-Letter Monitoring**: Track failed messages
- **Consumer Lag**: Delay in event processing

---

## 3. API Management on SAP BTP

### Core Components

**API Gateway**
- Central entry point for all APIs
- Rate limiting, throttling
- Authentication/authorization enforcement
- Request/response transformation
- Logging and analytics

**Developer Portal**
- API documentation (Swagger/OpenAPI)
- Sandbox/production environments
- API key/OAuth client management
- Developer community, feedback

**Policies & Flows**
- Pre/post-flow policies per operation
- Conditional flows based on headers, parameters
- Fault flows for error handling
- Shared flows for reusable logic

### API Design

**REST API for SAP Connectivity**
```
POST /api/v1/purchase-orders
Content-Type: application/json

{
  "vendorId": "V-001",
  "material": "MAT-123",
  "quantity": 100,
  "deliveryDate": "2024-05-01"
}

Response:
{
  "purchaseOrderNo": "PO-123",
  "status": "created",
  "link": "/api/v1/purchase-orders/PO-123"
}
```

**Policies Applied**
1. **Authentication**: OAuth 2.0, API Key, mTLS
2. **Rate Limiting**: 1000 requests/min per client
3. **Transformation**: Request/response mapping
4. **Logging**: Structured audit logs
5. **Caching**: Cache PO lookup responses (5 min TTL)

### Integration with iFlows

**Pattern: API → iFlow → SAP Backend**

```
Client Request → API Gateway (validate, throttle)
             → iFlow (transform, route)
             → RFC/BAPI (execute in SAP)
             → Response transform
             → Client Response
```

**Setup:**
1. Create iFlow with HTTP Sender adapter
2. Deploy iFlow in Cloud Integration
3. Create API in API Management pointing to iFlow URL
4. Apply policies (OAuth, rate limiting, transformation)
5. Publish to developer portal
6. Clients call API endpoint instead of iFlow directly

### API Versioning

**Strategy: URL path versioning**
```
/api/v1/purchase-orders  → Legacy behavior
/api/v2/purchase-orders  → New schema, fields
/api/v3/purchase-orders  → Performance improvements

Route requests based on version in policy
Deprecate old versions over time (announce 6 months before)
```

### OAuth 2.0 Setup for APIs

**Flow: Client Credentials**
```
1. Client registers in API Management
2. Receives: client_id, client_secret
3. Requests token: POST /token (client_id, client_secret)
4. Gets: access_token, expires_in
5. Calls API: Authorization: Bearer {access_token}
6. API Gateway validates token, proceeds
```

**Implementation:**
- API Management acts as OAuth server
- iFlow validates Bearer token (custom policy)
- Scope-based authorization (e.g., read:orders, create:orders)

---

## 4. RFC, BAPI, IDoc Integration Patterns

### RFC (Remote Function Call)

**When to Use**
- Call functions in SAP backend synchronously
- Need immediate response
- Single transaction context
- Request-reply pattern

**iFlow RFC Adapter Configuration**

```
Receiver Adapter: RFC
- Destination: Cloud Connector connection to SAP
- RFC Function: Create Purchase Order (BAPI_PO_CREATE)
- Connection Pool: 5 connections, max retries 3
- Timeout: 30 seconds
```

**Error Handling**
```
RFC Call → Timeout/Connection error?
         → Retry immediately (connection pool issue)
         → After 3 retries → Exception subprocess
         → Alert, log, store for manual review
```

**Context ID Usage** (for related calls in single transaction)
```
Context ID groups related RFC calls:
1. Create PO header (BAPI_PO_CREATE)
2. Add line item (BAPI_PO_CREATE_ADD_ITEM) - same context
3. Confirm (BAPI_TRANSACTION_COMMIT) - same context
All execute in single SAP transaction
```

### BAPI (Business API)

**Characteristics**
- RFC-based, high-level SAP APIs
- Input tables, output structures
- Built-in validation, authorization
- Return messages in BAPIRET2 table

**Common BAPIs**

| BAPI | Purpose | Input | Output |
|------|---------|-------|--------|
| **BAPI_PO_CREATE** | Create purchase order | Header, items | PO number, messages |
| **BAPI_PO_CHANGE** | Change PO | PO number, changes | Messages |
| **BAPI_SALESORDER_CREATE** | Create sales order | Header, items | SO number, messages |
| **BAPI_MATERIAL_GET** | Get material data | Material, plant | Material structure |
| **BAPI_CUSTOMER_GET** | Get customer data | Customer ID | Customer structure |
| **BAPI_INVOICE_CANCEL** | Cancel invoice | Invoice, fiscal year | Messages |
| **BAPI_TRANSACTION_COMMIT** | Commit changes | Work ID | Messages |
| **BAPI_TRANSACTION_ROLLBACK** | Rollback changes | Work ID | Messages |

**Error Handling in BAPI Response**
```xml
<BAPIRET2>
  <item>
    <TYPE>E</TYPE>  <!-- E=Error, W=Warning, S=Success -->
    <ID>MM</ID>
    <NUMBER>002</NUMBER>
    <MESSAGE>Material not found</MESSAGE>
  </item>
</BAPIRET2>

Mapping logic:
- Check TYPE field
- If TYPE='E': Throw exception, move to exception subprocess
- If TYPE='W': Log warning, continue
- If TYPE='S': Proceed
```

### IDoc (Intermediate Document)

**Characteristics**
- Asynchronous EDI format
- Guaranteed delivery, ordering
- Used for bulk data, master data synchronization
- Acknowledgment-based (IDOC_CONFIRMATION)

**IDoc Structure**
```
Control Record (EDI_DC40)
  ├─ Segment: EDI_DD40
  ├─ Segment: ORDERS05 (Order header)
  └─ Segment: ORDSEG05 (Order line items)
```

**IDoc Types**
- **ORDERS**: Purchase orders
- **INVOIC**: Invoices
- **DESADV**: Shipment notifications
- **MATMAS**: Material master
- **CUSTOMER**: Customer master
- **VENDOR**: Vendor master

**iFlow IDoc Adapter**
```
Receiver Adapter: IDoc
- Type: ORDERS05, version 2
- Port: SAP RFC destination
- Acknowledgment: Immediate or deferred
- Compression: Enable for large IDocs
- Serialization: Order sequence by DOCNUM
```

**IDoc Sequencing Pattern**
```
Multiple IDocs from same source:
1. Enable serialization in adapter
2. Queue name ensures order
3. SAP processes in sequence
Example: Vendor master change, then PO change (must be in order)
```

**Testing IDocs**
- Use Transaction WE19 (Test Tool for IDocs)
- Create test IDoc, send to integration system
- Monitor in WE02 (IDoc Monitoring)
- Check for acknowledgment (QAINS, SYNACK)

---

## 5. SAP Cloud Connector Setup & Configuration

### Architecture

```
On-Premise SAP Backend ← TCP Tunnel ← Cloud Connector ← Cloud Integration (BTP)
                                                      ↑
                                              HTTPS tunnel
                                            (secure, outbound only)
```

**Benefits**
- No inbound firewall rules needed
- Outbound-only connection
- Encryption end-to-end
- High availability with clustering

### Installation & Setup

**Step 1: Download & Install Cloud Connector**
```
1. Go to SAP Support Portal (https://support.sap.com)
2. Download: SAP Cloud Connector (latest version)
3. Install on Windows/Linux in DMZ or internal network
4. Minimum: 2GB RAM, 10GB disk, 2 CPU cores
```

**Step 2: Configure Cloud Connector**
```
Access: https://localhost:8443 (default)
Administrator Console:
  1. Change admin password (from default: initial.password)
  2. Configure proxy (if required)
  3. Set SSL certificate (trusted by BTP)
```

**Step 3: Register with Cloud Integration Tenant**
```
Cloud Connector Management UI:
  Connectivity → Sub-accounts
    → Add BTP subaccount
    → Subaccount ID (from BTP cockpit)
    → Region (eu10, us10, etc.)
    → Client ID and Client Secret (OAuth client in BTP)
    → Status should show Connected
```

**Step 4: Configure Backend Resources**
```
Cloud Connector → Connectivity → Access Control
  → Add Resource
    Protocol: HTTP or RFC
    Target Host: sap-backend.internal.com
    Target Port: 3200 (RFC gateway port)
    Security: Basic auth or X.509 certificate
```

### RFC Connectivity

**Setup RFC Destination in Cloud Connector**
```
Protocol: RFC
Target Host: SAP backend hostname/IP
Target Port: SAP RFC gateway port (typically 3200 for instance 00)
Gateway Service: sapgw00

Example for SAP system DEV:
Target: sap-dev.corp.internal
Port: 3200
Gateway: sapgw00
```

**Kerberos Authentication** (for Windows SAP systems)
```
1. Install Kerberos support in Cloud Connector
2. Create service account in Active Directory
3. Configure in Cloud Connector:
   - Authentication: Kerberos SPN
   - SPN: SAP/sap-dev.corp.internal@CORP.COM
4. Test connectivity from iFlow
```

### HTTP Connectivity

**Setup HTTP/HTTPS Backend**
```
Protocol: HTTP
Target Host: sap-backend.internal.com
Target Port: 8000 (typical SAP gateway port)
Security: 
  - Basic Auth: user, password
  - Client Certificate: X.509 (mutual TLS)
```

**Application Connectivity**
```
Typical SAP application ports:
- HTTP gateway: 8000 + instance number
- HTTPS: 44300, 44500, etc.
- OData: /sap/opu/odata/sap/...
- RFC: Direct via RFC gateway
```

### Load Balancing & High Availability

**Cloud Connector Cluster**
```
Multiple Cloud Connector instances → Single registration
┌─────────────────────────┐
│ Cloud Connector 1        │
│ (192.168.1.10:8443)     │ ─┐
└─────────────────────────┘  │
                             ├─→ Single registration to BTP
┌─────────────────────────┐  │
│ Cloud Connector 2        │  │
│ (192.168.1.11:8443)     │ ─┘
└─────────────────────────┘

BTP routes requests round-robin
Failover automatic if one instance down
Shared certificate (optional)
```

### Troubleshooting Cloud Connector

**Check Connectivity**
```
Cloud Connector UI → Monitoring
  - Check SAP backend resource status
  - View request/response logs
  - Monitor tunnel status (green = OK)
  - Check certificate expiration
```

**Common Issues**
```
1. Connection refused: Check target port, firewall
2. Authentication failed: Verify credentials, SPN for Kerberos
3. SSL certificate error: Update cert, check trust
4. High latency: Monitor network, connection pool size
5. Resource not found: Verify target host, port in access control
```

---

## 6. Azure Integration Patterns

### Logic Apps + SAP Connector

**Architecture**
```
Azure Service Trigger
    ↓
Parse JSON/XML
    ↓
SAP Connector (Call RFC/BAPI/IDoc)
    ↓
Transform response
    ↓
Action (send email, store database, etc.)
```

**Setup SAP Connector**

```
1. In Logic Apps Designer, add action: "SAP"
2. Create SAP connection:
   - Connection name: "SAP-Production"
   - SAP Application Server: sap-prod.internal
   - SAP Client: 100
   - SAP System Number: 00
   - SAP Username: INTEGRATION_USER
   - SAP Password: (secure)
   - SAP Language: EN

3. For on-premise SAP: Use on-premise data gateway
   - Gateway installed in DMZ/internal network
   - Connection established outbound (like Cloud Connector)
```

**Example: Call BAPI in Logic Apps**

```json
{
  "type": "ApiConnection",
  "inputs": {
    "host": {
      "connection": {
        "name": "@parameters('$connections')['sap']['connectionId']"
      }
    },
    "method": "post",
    "body": {
      "RFC_FUNCTION_NAME": "RFC_MATERIAL_GET_DETAIL",
      "RFC_FUNCTION_MODULE": "MATERIAL_GET",
      "IMPORT": {
        "I_MATERIAL": "@triggerBody()?['material_id']",
        "I_PLANT": "@triggerBody()?['plant_id']"
      }
    },
    "path": "/invoke"
  },
  "runAfter": {}
}
```

**Response Parsing**
```
EXPORT table from SAP:
  {
    "BAPIRET2": [
      {
        "TYPE": "S",
        "MESSAGE": "Material found",
        "MATERIAL_NO": "MAT-001",
        "PLANT": "P001"
      }
    ]
  }

Parse in Logic Apps:
  Material = body('Call_SAP')?['BAPIRET2'][0]?['MATERIAL_NO']
  Status = body('Call_SAP')?['BAPIRET2'][0]?['TYPE']
```

### Azure API Management + SAP

**Pattern: Expose SAP APIs through Azure APIM**

```
Client → Azure APIM (rate limit, auth, cache)
      → SAP via on-premise gateway or Cloud Connector
      → Response
```

**APIM Policies for SAP**

```xml
<!-- Incoming request -->
<policies>
  <inbound>
    <rate-limit calls="1000" renewal-period="60" />
    <validate-jwt header-name="Authorization">
      <openid-config url="https://login.microsoftonline.com/.../openid-configuration" />
    </validate-jwt>
    <set-backend-service base-url="https://sap-integration.servicetier.btp.cloud.sap" />
    <rewrite-uri template="/api/v1{path}" />
  </inbound>
  
  <backend>
    <forward-request />
  </backend>
  
  <outbound>
    <base />
    <cache-store duration="300" />
  </outbound>
</policies>
```

### Azure Service Bus + SAP Integration

**Event-driven pattern**

```
SAP iFlow publishes to Topic
    ↓
Azure Service Bus Topic
    ↓
Logic Apps subscription processes
    ↓
Actions: Send email, create ticket, update Dataverse
```

**iFlow: Publish to Azure Service Bus**

```
Receiver Adapter: AMQP (for Service Bus)
  - Connection string: (Endpoint=sb://namespace.servicebus.windows.net/...)
  - Topic name: sap.events
  - Message properties: Correlation ID, properties
```

---

## 7. Microsoft Power Automate + SAP

### Connector Types

**SAP ERP Connector (Microsoft)**
- Supports: RFC, BAPI calls
- Bidirectional: Call SAP and receive data
- OAuth-based authentication
- Best for: Low-code flows, no integration middleware

**On-Premise Data Gateway Required**
- Installed in DMZ/internal network
- Bridges cloud Power Automate to SAP
- Similar to Azure gateway or Cloud Connector

### Cloud Flow (Automated)

**Trigger: When an SAP record is created**
```
Trigger: SAP connector - "When an SAP record is created or modified"
  Action: RFC_NOTIFY_ORDER_CREATED

Flow steps:
1. Get SAP order details (BAPI_ORDERS_GET)
2. Send Teams notification
3. Create Dataverse record
4. Send approval email
5. Update SAP status (RFC_ORDER_APPROVED)
```

### Desktop Flow (RPA)

**Scenario: Extract SAP data via legacy UI**
```
1. Open SAP GUI (transaction: VA03)
2. Input sales order number
3. Extract fields: Customer, Amount, Items
4. Copy to clipboard
5. Call Power Automate cloud flow
6. Update Excel/Dataverse
```

**Desktop Flow Actions**
```
- Launch SAP application
- Enter text: Order number field
- Read table: Extract order items
- Click button: Submit
- Get variable: Extracted data
- Call cloud flow: Process in Power Automate
```

### Approval Workflow Example

```
1. Order created in SAP
   ↓
2. Trigger Power Automate cloud flow
   ↓
3. Get order details via BAPI
   ↓
4. Start approval in Power Automate
   (assigned to finance manager)
   ↓
5. Approval decision
   ├─ Approved: Call RFC_ORDER_CONFIRM in SAP
   └─ Rejected: Call RFC_ORDER_REJECT in SAP
   ↓
6. Send Teams notification
```

---

## 8. SAP Graph API

### What is SAP Graph?

**REST API providing unified access to SAP data**
- Real-time queries across S/4HANA, C/4C, SuccessFactors
- Single API, multiple sources
- Event notifications
- OAuth 2.0 based authentication

### Authentication

```
Client Credentials Flow:
1. POST /oauth/token?client_id=...&client_secret=...
2. Response: {"access_token": "...", "expires_in": 3600}
3. Use Bearer token in requests
```

### Common Graph Queries

**Get Business Partner**
```
GET /v1/business-partners/BP123
  ?$select=id,firstName,lastName,email,phone

Response:
{
  "id": "BP123",
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@company.com",
  "phone": "+1-555-0123"
}
```

**Query with Filter**
```
GET /v1/sales-orders
  ?$filter=status eq 'created' and customer eq 'ACME'
  &$orderBy=createdOn desc
  &$top=10

Returns: Array of sales orders matching criteria
```

**List Events**
```
GET /v1/event-notifications
  ?$filter=eventType eq 'PurchaseOrder.Created'
  &since=2024-04-01T00:00:00Z

Returns: Events since timestamp
```

### Integration with iFlow

**iFlow: Enrich data using SAP Graph**

```
1. Receive event: Material created
2. Call SAP Graph: GET /materials/{id}
3. Enrich with additional fields
4. Transform and send to downstream system
```

---

## 9. SAP Build Process Automation Integration

### Concepts

**Process Automation + Integration**
- Model business processes visually
- Integrate with SAP and external systems
- Auto-triggered workflows
- RPA for legacy systems

### Integration Points

**1. Trigger iFlow from SAP Build Process**
```
Process step: Call HTTP endpoint
  URL: https://integration-tenant.cloud.sap/http/...
  Method: POST
  Authentication: OAuth
  Body: Process context data

iFlow receives request → Processes → Returns response
```

**2. Call SAP Build Process from iFlow**
```
iFlow HTTP receiver calls SAP Build:
  POST /process/trigger/{processKey}
  Body: {instance data}

SAP Build Process processes and returns:
  Response with status, process instance ID
```

### Process with Multi-Step SAP Integration

```
Step 1: Receive order from web form
Step 2: Create PO in SAP (BAPI_PO_CREATE)
        ├─ If error: Alert, ask user to retry
        └─ If success: Continue
Step 3: Get inventory via SAP Graph
Step 4: Check approval (conditional logic)
        ├─ Amount < $1000: Auto-approve
        └─ Amount >= $1000: Send Teams approval
Step 5: Based on approval, confirm PO (BAPI_PO_CONFIRM) or reject
Step 6: Send notification to teams
```

---

## 10. Principal Propagation & SSO

### Concept

**Principal Propagation**: Pass SAP user identity through integration layers
```
User logs in → Azure AD → BTP → iFlow → SAP
User = john@company.com executes SAP transaction as themselves
(vs. executing as INTEGRATION_USER)

Benefits:
- Audit trail shows actual user
- Authorization checks per user
- Compliance for sensitive operations
```

### Azure AD + SAP Integration

**Setup**

```
1. Azure AD: Register SAP as application
   - Application ID: SAP tenant app ID
   - Permissions: SAP data access
   
2. BTP: Configure trust to Azure AD
   - Identity Provider: Azure AD
   - SAML/OIDC endpoints
   
3. SAP: Configure Azure AD as Identity Provider
   - Trust assertions from Azure AD
   - Map Azure AD claims to SAP users
   
4. iFlow: Extract user from JWT
   - Get Bearer token from caller
   - Extract user claims (preferred_username)
   - Pass to SAP in request header
```

**Header-based Principal Propagation**

```
HTTP Request with Bearer token (Azure AD JWT):
  Authorization: Bearer eyJhbGciOiJSUzI1NiIs...

iFlow extracts user:
  1. Validate JWT signature
  2. Extract "preferred_username" claim: john@company.com
  3. Set custom header: X-SAP-User: john
  
RFC call to SAP:
  - Include X-SAP-User header
  - SAP gateway recognizes and uses for authorization
  - All audit logs show john@company.com
```

### SSO Flow: User Portal to SAP

```
1. User opens Portal (BTP Launchpad)
2. Portal calls iFlow API
3. iFlow extracts JWT bearer token (Azure AD)
4. iFlow prepares SAP request with user identity
5. Cloud Connector routes to SAP
6. SAP authorizes as user (checks role assignments)
7. Displays data user has access to
```

### Handling Timeouts

```
User session expires:
1. Portal triggers refresh token flow (Azure AD)
2. Gets new JWT
3. iFlow validates new token
4. Subsequent SAP calls use fresh authentication
```

---

## 11. Error Handling & Monitoring Patterns

### Error Handling in iFlows

**Exception Subprocess**

```
Main flow:
  HTTP Request → Parse JSON → Call RFC
                                  ↓
                         Success: Transform & Send
                         
                         Failure: Exception subprocess

Exception subprocess:
  1. Log error message
  2. Store in database (message body, error details)
  3. Send alert (mail, Teams, ServiceNow)
  4. Return error response to caller (HTTP 500)
  5. Optional: Retry after delay
```

**Retry Logic**

```
RFC adapter configuration:
  Max retries: 3
  Retry interval: 30 seconds exponential backoff
  Timeout: 30 seconds per attempt
  
If RFC_DESTINATION_NOT_FOUND:
  → Retry (maybe Cloud Connector reconnecting)
  
If RFC timeout:
  → Retry (network latency)
  
If RFC authorization error:
  → Don't retry (will fail again)
  → Move to exception subprocess immediately
```

**Idempotency Check**

```
1. Extract unique identifier (order number, transaction ID)
2. Check database: has this ID been processed?
3. If yes: Return cached response (idempotent)
4. If no: Process, store result with ID
```

### Message Tracing

**View iFlow Execution**

```
Cloud Integration UI → Monitor → Message Processing
  - Search by: correlation ID, sender, receiver, date
  - View: Full message payload at each step
  - Debug: Mapping errors, adapter responses
  - Timing: Total duration, step duration
```

**Common Issues Found**

```
- Mapping: Field missing from input (null handling)
- Adapter: Wrong destination, authentication failure
- Timeout: RFC hangs, external API slow
- Transformation: Incorrect XPath, JSON key mismatch
```

### Monitoring & Alerts

**Cloud Integration Monitoring**

```
KPIs:
- Message count: processed, failed, pending
- Latency: average, p95, max
- Success rate: % successful vs failed
- Queue depth: messages waiting

Alerts:
- High failure rate (> 5%)
- Latency SLA breach (> 30s)
- Queue depth increasing (possible bottleneck)
- Integration artifact not deployed
```

**Application Insights Integration**

```
iFlow writes custom events to Application Insights:
  - Correlation ID
  - Operation name, duration
  - Custom metrics: items processed, amount
  - Errors: exception stack trace

Queries in Kusto:
  customEvents
  | where name == "Order Processing"
  | where timestamp > ago(1d)
  | summarize count(), avg(duration) by bin(timestamp, 1h)
```

### Alerting Setup

**Email Alert on Integration Failure**

```
Cloud Integration Alert Rule:
  Trigger: Message Processing Status = Error
  Condition: Error count > 5 in last 15 minutes
  Action: Send email to ops@company.com with:
    - Error message, timestamp
    - Correlation ID, sender
    - Link to message trace in Cloud Integration UI
```

**Teams Alert**

```
Azure Logic Apps triggered by Cloud Integration event:
  1. Integration Artifact logs error
  2. Event Hub → Logic Apps
  3. Format Teams message with:
    - Alert severity
    - Integration name, error
    - Link to trace
  4. Post to Teams channel #sap-integration-alerts
```

---

## 12. Common Integration Scenarios

### Scenario 1: S/4HANA to Azure (PO Synchronization)

**Objective**: Purchase orders created in S/4HANA appear in Azure Dataverse in real-time

**Design**

```
S/4HANA Event (PO Created)
    ↓
SAP Event Mesh Topic (sap.s4.beh.po.v1.Created)
    ↓
Cloud Integration iFlow (Consumer)
    ↓
Transform to Dataverse schema
    ↓
Azure Logic Apps (HTTP trigger)
    ↓
Create Dataverse Table "Purchase Orders"
    ↓
Send notification to Purchasing team (Teams)
```

**iFlow Components**

1. **Kafka Sender** (subscribe to Event Mesh topic)
   - Topic: sap.s4.beh.po.v1.Created
   - Consumer group: cpi-dataverse-sync

2. **Message Mapping**
   ```
   Input: S/4HANA PO event
   {
     "PurchaseOrder": "PO-1001",
     "Vendor": "V-001",
     "Amount": 10000,
     "Currency": "USD"
   }
   
   Output: Dataverse schema
   {
     "po_id": "PO-1001",
     "vendor_id": "V-001",
     "amount": 10000,
     "currency": "USD",
     "source_system": "S4HANA",
     "created_timestamp": "2024-04-11T10:30:00Z"
   }
   ```

3. **HTTP Receiver** (call Logic Apps)
   - Endpoint: https://prod-12.centralus.logic.azure.com/flows/...
   - Method: POST
   - Authentication: Shared secret (in iFlow credential)

4. **Exception Handling**
   - If HTTP fails: Retry 3 times
   - If Dataverse error: Send Teams alert
   - Store failed message in JMS queue for replay

**Logic Apps Flow**

```json
{
  "definition": {
    "triggers": {
      "manual": {
        "type": "Request",
        "inputs": {
          "schema": {
            "type": "object",
            "properties": {
              "po_id": {"type": "string"},
              "vendor_id": {"type": "string"},
              "amount": {"type": "number"}
            }
          }
        }
      }
    },
    "actions": {
      "Create_record": {
        "type": "ApiConnection",
        "inputs": {
          "host": {"connection": {"name": "@parameters('$connections')['dataverse']['connectionId']"}},
          "method": "post",
          "path": "/v9/entities/msdyn_purchaseorders",
          "body": {
            "msdyn_po_id": "@triggerBody()?['po_id']",
            "msdyn_vendor_id": "@triggerBody()?['vendor_id']",
            "msdyn_amount": "@triggerBody()?['amount']"
          }
        }
      },
      "Post_to_Teams": {
        "type": "ApiConnection",
        "inputs": {
          "host": {"connection": {"name": "@parameters('$connections')['teams']['connectionId']"}},
          "method": "post",
          "path": "/v3/beta/teams/@{encodeURIComponent('team-id')}/channels/@{encodeURIComponent('channel-id')}/messages",
          "body": {
            "body": "New PO created: @{triggerBody()?['po_id']} from @{triggerBody()?['vendor_id']} for $@{triggerBody()?['amount']}"
          }
        }
      }
    }
  }
}
```

### Scenario 2: BTP to M365 (Employee Data Sync)

**Objective**: SAP SuccessFactors employees sync to Microsoft 365 (Azure AD, Exchange, Teams)

**Design**

```
SAP SuccessFactors OData API
    ↓
iFlow (scheduled poller, daily 2 AM)
    ↓
Transform to M365 schema
    ↓
Microsoft Graph API (Create/Update users)
    ↓
Azure AD User created
    ↓
Exchange mailbox provisioned
    ↓
Teams auto-add to company teams
```

**iFlow Scheduler**

```
Timer trigger: Daily at 2:00 AM (UTC)
HTTP receiver:
  - OData query: /EmployeeList?$filter=modifiedDate gt ...
  - Get changed employees since last run
  - Pagination: $skip, $top (1000 per request)
```

**Mapping Logic**

```
SuccessFactors → M365 field mapping

firstName → givenName
lastName → surname
email → userPrincipalName (email@company.onmicrosoft.com)
employeeId → employeeId (custom attribute)
department → department
manager → manager (reference to manager's UPN)
jobTitle → jobTitle
officeLocation → officeLocation
phone → mobilePhone or businessPhone
startDate → startDate
```

**Error Scenarios**

```
1. Employee exists in M365: Update (PATCH) instead of POST
2. Duplicate email: Append domain suffix, alert to HR
3. Manager not found: Warn, assign to HR manager temporary
4. Rate limit (Microsoft): Backoff 60 seconds, retry
5. Inactive employee: Mark as disabled in Azure AD
```

### Scenario 3: SAP to Teams (Order Notifications)

**Objective**: Order created in S/4HANA → Teams message in sales channel

**Design**

```
S/4HANA Event (Sales Order Created)
    ↓
iFlow: Enrich with customer details (SAP Graph)
    ↓
Format Teams message with card
    ↓
Teams Incoming Webhook
    ↓
Message in #sales-orders channel
    ↓
Interactive card: Approve, Reject, View in SAP
```

**iFlow Components**

1. **Event trigger**: Kafka (Event Mesh)
2. **Enrichment**: SAP Graph call for customer info
3. **Mapping**: Sales order → Teams card JSON
4. **Receiver**: HTTP (Teams webhook)

**Teams Message Card**

```json
{
  "@type": "MessageCard",
  "@context": "https://schema.org/extensions",
  "summary": "New Sales Order SO-1234",
  "themeColor": "0078D4",
  "sections": [
    {
      "activityTitle": "New Sales Order Created",
      "activitySubtitle": "Order SO-1234",
      "facts": [
        {"name": "Customer", "value": "Acme Corp"},
        {"name": "Amount", "value": "$50,000 USD"},
        {"name": "Delivery Date", "value": "2024-05-15"},
        {"name": "Status", "value": "Created"}
      ],
      "markdown": true
    }
  ],
  "potentialAction": [
    {
      "@type": "OpenUri",
      "name": "View in SAP",
      "targets": [
        {
          "os": "default",
          "uri": "https://sap-launchpad.btp.cloud.sap/site#Shell-home?SO=SO-1234"
        }
      ]
    },
    {
      "@type": "Action",
      "name": "Approve",
      "inputs": [
        {
          "@type": "Action.Submit",
          "id": "approve_so_1234"
        }
      ]
    }
  ]
}
```

**Teams Response Handling**

```
User clicks "Approve" → Teams webhook → Logic Apps
  ↓
Logic Apps calls iFlow: /approve-so
  ↓
iFlow calls SAP: BAPI_SALESORDER_CONFIRM (SO-1234)
  ↓
Update message in Teams with success/error
```

---

## Quick Reference

### Key Transactions & Tools

| Item | Purpose | Access |
|------|---------|--------|
| **WE19** | Test IDocs | SAP GUI, Logistics |
| **WE02** | Monitor IDocs | SAP GUI, Logistics |
| **SM59** | RFC destinations | SAP GUI, Administration |
| **SE37** | Test RFC functions | SAP GUI, Development |
| **SE24** | ABAP class browser | SAP GUI, Development |
| **SOAMANAGER** | Web services | SAP GUI, Development |
| **Transaction SICF** | HTTP handler config | SAP GUI, Administration |

### BTP URLs

```
Cockpit: https://cockpit.eu10.hana.ondemand.com (varies by region)
Cloud Integration: https://tenant.integrationsuite.cloud.sap
API Management: https://tenant.apimanagement.hana.ondemand.com
Build Process Auto: https://build.cloud.sap
```

### Common Ports

```
SAP RFC Gateway: 3200-3299 (instance dependent)
SAP HTTP gateway: 8000-8099 (instance dependent)
SAP Message Server: 3600-3699
Cloud Connector: 8443 (admin), 20003-20004 (tunneling)
```

### Useful Links

- [SAP Integration Suite Documentation](https://help.sap.com/docs/SAP_INTEGRATION_SUITE)
- [SAP BTP Learning](https://learning.sap.com/learning-journeys)
- [Microsoft SAP Connector Docs](https://docs.microsoft.com/en-us/connectors/sap)
- [SAP Cloud Connector Guide](https://help.sap.com/docs/SCLOUD)
- [SAP Graph API Playground](https://hub.sap.com/resources/sap-graph)

---

## Troubleshooting Checklist

**Integration Not Running**
- [ ] Is the iFlow deployed and running (not in error state)?
- [ ] Check Cloud Integration monitoring for failures
- [ ] Verify Cloud Connector is connected (green status)
- [ ] Check RFC destination exists and can be reached
- [ ] Review message trace for detailed errors

**SAP Adapter Connection Issues**
- [ ] Verify Cloud Connector has access to SAP backend
- [ ] Test RFC destination in Cloud Connector UI
- [ ] Check SAP user credentials (user, password, client)
- [ ] Confirm SAP user has required authorization (RFC function)
- [ ] Review SAP system logs (SM50, ST02)

**Performance Problems**
- [ ] Monitor iFlow latency (typical: 100-500ms for RFC)
- [ ] Check RFC connection pool settings
- [ ] Review SAP workload (dialog, batch processes)
- [ ] Analyze network latency between Cloud Connector and SAP
- [ ] Consider parallel processing for bulk operations

**Data Transformation Errors**
- [ ] Review message trace: input vs output
- [ ] Check mapping logic: XPath expressions, functions
- [ ] Validate input schema: missing fields, wrong types
- [ ] Test mapping locally with sample data
- [ ] Enable debug logging in iFlow

**Azure Integration Issues**
- [ ] Verify on-premise gateway is running and connected
- [ ] Check Azure credentials in Logic Apps connection
- [ ] Review Azure authentication: shared key, SAS token
- [ ] Monitor Logic Apps run history for detailed errors
- [ ] Test connection independently (query Dataverse)

---

**Last Updated**: 2024-04-11
**Author**: SAP Integration Team
**Feedback**: Contact integration-support@company.com
