---
name: SAP on Azure Architecture Expert
description: Comprehensive guidance for SAP Technical Experts designing, deploying, and optimizing SAP infrastructure on Microsoft Azure. Covers VM sizing, HANA deployment architectures, high availability patterns, disaster recovery strategies, networking, cost optimization, landing zones, backup solutions, monitoring, and migration patterns. Essential for anyone working with SAP infrastructure, Azure VMs for SAP, HANA sizing decisions, SAP migration projects, SAP HA/DR implementations, or cloud-based SAP deployments.
---

# SAP on Azure Architecture Expert Skill

## Overview

This skill provides expert-level guidance for SAP Technical Experts and architects working with SAP workloads on Microsoft Azure. Whether you're designing new SAP deployments, optimizing existing infrastructure, planning migrations, or implementing high availability solutions, this skill delivers practical, production-ready recommendations aligned with Microsoft's Cloud Adoption Framework and Well-Architected Framework.

---

## 1. SAP on Azure VM Sizing & Selection

### Certified Azure VM Series for SAP

**HANA Database Tier**
- **Mv2-series** (Memory optimized): Up to 5.7 TB RAM per instance
  - Ideal for very large HANA databases (>2 TB)
  - 192 vCPUs maximum
  - Premium SSD and Ultra Disk support
  - Single socket optimization with direct memory attachment
  
- **M-series** (Memory optimized): Up to 3.89 TB RAM per instance
  - Standard for production HANA deployments
  - Flexible vCPU configurations (8 to 128 vCPUs)
  - SAP-certified for all HANA versions
  - Good cost-to-performance ratio

- **E-series** (Memory optimized): Up to 2.04 TB RAM per instance
  - Suitable for smaller HANA instances (< 500 GB)
  - Lower cost than M-series
  - Still offers excellent performance
  - Good for non-production or development/test environments

**Application Server Tier**
- **D-series**: General-purpose compute for SAP NetWeaver applications
- **F-series**: Compute-optimized for high-CPU workloads
- **B-series**: Burstable instances for low-utilization environments

### VM Sizing Decision Framework

1. **Database Size Assessment**
   - Gather current SAP database size (HANA size report)
   - Account for growth over 3-5 year horizon
   - Add 20-30% headroom for data growth

2. **Performance Metrics**
   - CPU requirement: SAP Early Watch Alert, Stefan Mueller benchmarks
   - Memory requirement: 1.5-2x database size for optimal performance
   - Network throughput: Ensure Premium NIC (8+ Gbps bandwidth)

3. **Certification Verification**
   - Cross-reference SAP HANA Hardware Directory
   - Confirm with SAP Note 2015553 (SAP on Azure support matrix)
   - Validate against current SAP Support matrix

### Storage Tier Considerations

- **Premium SSD (P30-P80)**: General HANA data, logs, and backups
- **Ultra Disk**: High-performance redo logs with very low latency
- **Azure NetApp Files (ANF)**: Shared storage for scale-out, snapshots, cross-region replication

---

## 2. SAP HANA Deployment Architectures

### Scale-Up (Single Node to 6 Nodes)

**Architecture Overview**
- Single HANA instance with vertical scaling
- All data on one node with multiple CPU/memory expansion
- Shared storage backend (typically ANF or Premium SSD)

**When to Use**
- Most common for production deployments
- Simpler operations and licensing
- Suitable for databases up to 6 TB typically

**Key Considerations**
- Single point of failure without additional HA layers
- Easier to manage and monitor
- Linear cost increase with vertical scaling
- Maximum VM is 20 TB (Mv2-series)

**Implementation Steps**
1. Select appropriate VM size (M-series or Mv2)
2. Configure high-performance storage (ANF preferred for snapshots)
3. Implement OS-level striping across multiple disks if needed
4. Set HANA global.ini parameters for scale-up optimization
5. Configure HANA resource limits matching VM capacity

### Scale-Out (2-16 Nodes)

**Architecture Overview**
- Distributed HANA system across multiple nodes
- Data partitioning across worker nodes
- One or more standby/slave nodes for HA

**When to Use**
- Very large databases (>6 TB)
- Horizontal growth strategy
- Extreme performance requirements
- Complex calculation scenarios

**Deployment Considerations**
- Requires shared storage for /hana/shared partition (ANF mandatory)
- Higher operational complexity
- Multiple node management and monitoring
- Licensing impacts (count-based for some components)

**HSR Compatibility**
- Scale-out systems can use HANA System Replication
- Typically 2 Tier-1 nodes + 1-2 standby nodes

**Configuration Steps**
1. Design storage architecture with ANF (100+ GiB/s throughput)
2. Configure worker node distribution strategy
3. Set memory allocation per node
4. Configure HANA system replication for the cluster
5. Implement OS-level clustering for failover
6. Test automatic failover scenarios

### High-Availability Scale-Out (HSR)

**Architecture Overview**
- Scale-out system with HANA System Replication to secondary site
- Combines horizontal scaling with geographical redundancy
- Synchronous or asynchronous replication

**Deployment Patterns**
- Primary 4 nodes + Secondary 4 nodes (HSR Tier 1-2)
- Regional failover capability
- Typically spans 2-3 availability zones minimum

---

## 3. High Availability Patterns

### Pacemaker (Linux-Based HA)

**Architecture**
- Open-source cluster management for SUSE/Red Hat Linux
- Corosync for cluster communication
- Resource agents for HANA-specific management

**Implementation**
1. Configure two or more VMs in same availability zone (or across zones)
2. Install Pacemaker, Corosync, and fence agents
3. Create Pacemaker cluster configuration
4. Define HANA resource agents with scoring
5. Configure stonith (fencing) for split-brain prevention
6. Test automatic failover and recovery

**Key Parameters**
- `migration-threshold`: Failure count before resource migration
- `failure-timeout`: Time to declare resource failed
- `start-failure-is-fatal`: Boolean for strict failure handling

**Azure-Specific Setup**
- Use Azure Fence Agent for STONITH (VM restart via API)
- Configure user-assigned managed identity for fence agent
- Place cluster nodes in Availability Set or Availability Zones

### WSFC (Windows Cluster for SAP ASE)

**Architecture**
- Windows Server Failover Clustering for SAP Adaptive Server Enterprise
- Shared storage quorum (file share or cloud witness)
- Network-based heartbeat

**Deployment**
1. Deploy two or more Windows VMs in availability set
2. Enable Failover Clustering feature
3. Create WSFC cluster with quorum witness
4. Add SAP ASE resources to cluster
5. Configure cluster network settings
6. Test failover scenarios

**Storage Considerations**
- Shared storage (ANF or managed disk) for cluster validation
- Cloud witness for quorum in absence of shared storage
- LUN mapping and SCSI reservation

### Azure Load Balancer Configuration

**Standard Load Balancer Setup**
1. Create internal Standard Load Balancer (Layer 4)
2. Define backend pool with HA-enabled VMs
3. Create health probe targeting HANA port (typically 50013 for HSR)
4. Configure load balancing rules for SAP application traffic
5. Enable floating IP for direct server return

**Advanced Patterns**
- Separate LBs for different SAP components (database, app server, web dispatcher)
- Multiple VIPs for different SAP instances
- Session persistence for stateful applications

**Azure SQL Patterns**
- Use Azure SQL managed instance for simpler HA
- Automatic failover groups across regions
- Built-in backup and point-in-time restore

### Availability Zones Strategy

**Zone-Redundant Deployments**
1. Distribute HA cluster nodes across 3 availability zones
2. Configure cross-zone load balancing
3. Leverage Azure's SLA guarantees (99.99% for zone-redundant)
4. Account for inter-zone bandwidth costs

**Zone Selection**
- Check zone capacity before deployment
- Avoid zones at over 80% utilization
- Monitor zone health status proactively

---

## 4. Disaster Recovery Strategies

### Azure Site Recovery (ASR) for SAP

**Replication Architecture**
- Continuous replication of source VMs to secondary region
- RPO as low as 5 minutes with frequent snapshots
- RTO typically 30-60 minutes depending on failover complexity

**Implementation Steps**
1. Create Recovery Services Vault in target region
2. Enable replication for HANA VMs (replication policy)
3. Configure target resource groups and networking
4. Set recovery plan with scripts for SAP instance startup
5. Test failover regularly (non-disruptive)
6. Monitor replication health and lag

**SAP-Specific Configuration**
- Create recovery plans grouping dependent VMs
- Define startup sequence: Database → App servers → Web dispatcher
- Include post-failover scripts for SAP instance registration
- Implement SAP license reassignment automation if needed

**Considerations**
- ASR not suitable as primary HA mechanism
- Use for regional disaster recovery (not local HA)
- Requires storage replication to secondary region

### HANA System Replication (HSR) Cross-Region

**Architecture**
- Primary HANA in Region A
- Secondary HANA in Region B via HSR
- Synchronous or asynchronous mode options

**Synchronous Mode (Tier 0/1)**
- Very low RPO (zero-loss target)
- Higher latency impact on primary
- Suitable for critical production systems
- Cross-region latency typically acceptable with Azure ExpressRoute

**Asynchronous Mode (Tier 2)**
- Lower latency on primary
- Some data loss risk in failure scenario
- Better performance for cross-region replication
- Acceptable for RPO of minutes

**Implementation**
1. Deploy secondary HANA system in paired region
2. Configure HSR with appropriate mode
3. Set up automated takeover script
4. Configure log shipping backup strategy
5. Implement monitoring for replication lag
6. Test failover with SAP landing zone procedures

**Monitoring Parameters**
- `log_shipping_timeout`: Maximum acceptable replication lag
- `hsa_operation_mode`: Logsync or deltalog strategy
- Replication lag (monitor continuously)

### Backup Strategy for DR

- **Differential backups**: First full + daily differentials
- **Log backups**: Continuous or frequent (every 15-30 minutes)
- **Snapshots**: ANF snapshots for point-in-time recovery
- **Geo-redundant storage**: Backup copies to secondary region
- **Backup validation**: Regular restore tests

---

## 5. Azure Networking for SAP

### Virtual Network (VNet) Design

**Hub-Spoke Model (Recommended)**
- **Hub VNet**: Central networking hub with shared services
  - Azure Firewall, VPN Gateway, ExpressRoute Gateway
  - Centralized DNS, Azure Bastion
  
- **Spoke VNets**: SAP environment-specific (Prod, Dev, UAT)
  - Each spoke contains HANA, app servers, middleware
  - Isolated security boundaries per environment

**Addressing Strategy**
- Plan for current + 3-5 year growth
- Non-overlapping IP ranges across all spokes
- Use RFC 1918 ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
- Document and centralize in IPAM solution

### Network Security Groups (NSGs)

**Tiered Approach**
1. **Subnet-level NSGs**: Coarse filtering (application subnet, database subnet)
2. **VM NIC-level NSGs**: Fine-grained rules (specific SAP ports)

**Common SAP Ports**
- HANA: 30013 (SQL), 30015 (SSFS), 30016, 30017 (HSR)
- SAP NetWeaver: 3300-3399 (Gateway), 3600-3699 (Dispatcher)
- RFC: 3200-3299 (NetWeaver RFC)
- HTTP/HTTPS: 80, 443

**NSG Rules Pattern**
- Source: Specific service tags or IP ranges
- Destination: Database/app tier subnets
- Priority: Document and sequence carefully
- Logging: Enable flow logs for troubleshooting

### ExpressRoute for SAP Connectivity

**Benefits for SAP**
- Dedicated, private connection to Azure
- Consistent low-latency (vs. internet VPN)
- Bandwidth guarantees (50 Mbps to 100 Gbps)
- SLA coverage with Azure backbone

**Circuit Configuration**
1. Establish ExpressRoute circuit (local provider)
2. Configure private peering to VNet
3. Establish BGP sessions for route advertisement
4. Test connectivity and latency to on-premises SAP systems
5. Implement failover to secondary ExpressRoute circuit

**Integration with SAP Landscape**
- Direct connectivity for SAP solutions manager
- Low-latency for DMO (Data Migration Option) replication
- Consistent network performance for end-user access

### Proximity Placement Groups (PPGs)

**Purpose**
- Reduce network latency between VMs (especially scale-out)
- Collocate VMs within same data center room

**SAP Scale-Out Implementation**
1. Create PPG in resource group
2. Deploy all scale-out nodes with PPG constraint
3. Typically reduces inter-node latency to < 1ms
4. Essential for HANA System Replication and clustering

**Constraints**
- Cannot resize VMs easily within PPG
- Availability zone selection mandatory
- Limits VM flexibility during scaling

---

## 6. Cost Optimization for SAP on Azure

### Reserved Instances (RIs)

**SAP-Focused Strategy**
- **3-year terms**: 40-45% savings vs. on-demand
- **Stable production workloads**: Ideal candidates (HANA, app servers)
- **Non-production environments**: Pay-as-you-go flexibility

**Implementation**
1. Analyze 30-90 day usage to identify stable workloads
2. Purchase RIs covering 70-80% of estimated stable load
3. Use on-demand for variable/temporary capacity
4. Monitor and adjust annually

**Considerations**
- RI commitment risk for rapidly changing landscapes
- Flexibility provided by 1-year terms for uncertain workloads
- Regional vs. zonal RIs (regional offers more flexibility)

### Azure Hybrid Benefit (AHB)

**Software Licensing Savings**
- **Windows Server**: Bring existing licenses, save 40%+ annually
- **SQL Server**: Leverage Software Assurance, avoid duplicate licensing
- **SAP License**: No direct AHB (license included in Azure pricing for certified instances)

**Activation**
1. Verify Software Assurance coverage for existing licenses
2. Apply AHB during VM creation or after deployment
3. Use Azure Portal or ARM templates to specify AHB

**Document Compliance**
- Maintain Software Assurance evidence
- Track license deployment for audits
- Use only for same-purpose workloads

### Right-Sizing Recommendations

**Monthly Process**
1. Review Azure Monitor metrics (CPU, memory, disk, network)
2. Identify underutilized VMs (consistently <30% CPU)
3. Propose downsizing or consolidation
4. Test in dev/test environment first
5. Schedule maintenance window for production

**Tools and Methods**
- Azure Advisor cost recommendations
- Azure Monitor custom workbooks
- SAP Solution Manager early watch alerts
- Third-party cost optimization tools

### Backup Cost Optimization

- Archive old backups to cool/archive tier
- Disable geo-redundancy for non-critical backups
- Use incremental snapshots vs. full backups
- Evaluate backup frequency vs. RPO requirements

---

## 7. SAP on Azure Landing Zone Best Practices

### Cloud Adoption Framework (CAF) Alignment

**Enterprise-Scale Landing Zone Pattern**
1. **Governance**: Resource groups, policy, RBAC per environment
2. **Connectivity**: Hub-spoke VNet topology with ExpressRoute
3. **Identity**: Azure AD integration, conditional access, MFA
4. **Security**: Network segmentation, encryption, compliance
5. **Operations**: Monitoring, backup, patch management

**Resource Organization**
```
Subscription Structure:
├── Management (policy, governance, logging)
├── Connectivity (VNets, ExpressRoute, firewall)
├── Identity (Azure AD, conditional access)
└── Landing Zone Subscriptions
    ├── Prod (HANA, critical app servers)
    ├── Dev (development instances)
    ├── UAT (user acceptance testing)
    └── Disaster Recovery (secondary region)
```

### Well-Architected Framework Pillars

**Reliability**
- Multi-zone deployments for 99.99% availability
- HANA System Replication for RPO/RTO requirements
- Automated failover with Pacemaker/WSFC
- Regular disaster recovery testing

**Security**
- Network isolation with NSGs and Azure Firewall
- Encryption at rest (Azure Disk Encryption) and in transit (TLS)
- Azure Key Vault for SAP system secrets
- Azure Sentinel for threat detection
- Regular vulnerability scanning

**Cost Optimization**
- Reserved Instances for predictable workloads
- Scheduled shutdowns for non-production environments
- Right-sizing based on actual utilization
- Consolidation of underutilized instances

**Operational Excellence**
- Infrastructure as Code (IaC) for reproducible deployments
- Centralized monitoring with Azure Monitor
- Automated patching with Azure Automation
- Documentation and runbooks for common operations

**Performance Efficiency**
- Premium storage and Ultra Disks for HANA
- Proximity placement groups for scale-out
- Azure NetApp Files for shared storage
- Direct server return with load balancers

---

## 8. Backup Strategies for SAP

### Azure Backup for HANA

**Implementation Architecture**
1. Deploy HANA backup agent on database VMs
2. Configure backup policy (daily full + incremental backups)
3. Specify retention periods (short-term: 30 days, long-term: 7 years)
4. Enable geo-redundant backup copies

**Backup Policy Example**
- **Daily full backup**: Sunday-Saturday at 2:00 AM UTC
- **Log backups**: Every 15 minutes (up to 30 days)
- **Weekly incremental**: Thursday at 1:00 AM
- **Monthly retention**: 12 months
- **Yearly retention**: 5 years (annual full backup)

**Backup Validation**
- Monthly restore tests to isolated database
- Document restore time objectives (RTO)
- Validate log shipping completeness
- Test cross-region backup restore

### Azure NetApp Files (ANF) Snapshots

**Snapshot Architecture**
- Instant snapshots of HANA volumes
- Space-efficient (copy-on-write)
- Point-in-time recovery capability

**Implementation**
1. Deploy ANF with HANA optimization (SMB or NFS)
2. Configure snapshot policies (hourly, daily, weekly)
3. Enable snapshot replication to secondary region
4. Implement automated snapshot management

**Use Cases**
- Pre-patch snapshots for quick rollback
- Hourly snapshots for low-RPO requirements
- Cross-region replication for DR
- Clone creation for dev/test refreshes

### Backup Storage Tiering

- **Hot storage**: Current week's backups (immediate access)
- **Cool storage**: 1-12 months of backups
- **Archive storage**: 1-7 year retention (long-term compliance)

**Cost Optimization**
- Automatic transition to cool/archive after 30 days
- Azure Backup default tiering policies
- Manual promotion for high-priority recovery scenarios

---

## 9. Monitoring & Observability

### Azure Monitor for SAP Solutions

**Deployment Architecture**
1. Deploy SAP Monitor resource in resource group
2. Configure SAP Provider (ABAP/Java stack connector)
3. Deploy monitoring agents on SAP instances
4. Send metrics to Log Analytics workspace
5. Create custom workbooks and alerts

**Metrics to Monitor**
- **Database**: Free memory, buffer pool efficiency, log space
- **Application**: Work process utilization, batch job status, user sessions
- **System**: CPU, disk I/O, network throughput
- **HA/DR**: Replication lag, cluster node status, failover readiness

### SAP Solution Manager Integration

**Connectivity**
- Establish direct network connectivity to on-premises Solution Manager
- Use ExpressRoute for dedicated, low-latency connection
- Implement network segmentation for security

**Features**
- Early Watch Alert analysis (HANA, NetWeaver)
- Usage and exception monitoring
- Root cause analysis (transaction analysis)
- Best practice recommendations

### Custom Monitoring & Alerts

**Recommended Queries**
```
Azure Monitor KQL Examples:
- Free HANA memory trend over 30 days
- SAP work process utilization by instance
- Database backup completion time history
- Network latency to on-premises systems
```

**Alert Thresholds**
- HANA memory < 10% free: CRITICAL
- Backup failure or delay: HIGH
- Replication lag > 5 minutes (synchronous): CRITICAL
- CPU consistently > 80%: WARNING

**Escalation Procedures**
1. Automated alerts to ops team (email, Teams)
2. Slack/Teams integration for real-time notification
3. Automatic runbook execution for self-healing scenarios
4. Escalation to SAP basis team after 30 minutes

---

## 10. SAP Migration Patterns to Azure

### Heterogeneous Migration (SAP DMO)

**Use Case**
- Different source/target database combinations
- Source: Traditional SAP DB (MaxDB, Oracle, SQL Server)
- Target: HANA on Azure

**Architecture**
- Parallel run system during transition
- SAP DMO (Database Migration Option) replication
- Staged cutover approach
- Rollback capability maintained until go-live +30 days

**Timeline & Phasing**
1. **Preparation (4-8 weeks)**
   - System sizing and capacity planning
   - Storage and networking design
   - User acceptance testing environment setup

2. **Technical Migration (2-4 weeks)**
   - DMO replication initial load
   - Network configuration and ExpressRoute activation
   - Failover tests in non-production

3. **Go-Live (1-2 weeks)**
   - Final replication cycle
   - Cutover execution
   - Parallel run validation
   - Old system retirement

**Best Practices**
- Extract-Transform-Load (ETL) for non-SAP data
- Test critical business processes thoroughly
- Plan for unforeseen issues with 2-3 week buffer
- Maintain detailed cutover runbook

### Homogeneous Migration (SWPM)

**Use Case**
- Same database platform (HANA to HANA)
- Typically on-premises HANA to Azure HANA
- Faster than heterogeneous migration

**SAP SUM (Software Update Manager) Approach**
1. Run SUM for shadow instance on Azure
2. Execute shadow instance creation
3. Start replication with shadow system
4. Perform transactional cutover
5. Validate system post-migration

**Timeline**
- Shorter than DMO (1-2 weeks downtime)
- Faster replication of large datasets
- Simpler rollback if needed

### Application Re-Platform (Lift-and-Shift)

**Architecture**
- Minimal application changes
- Infrastructure migration focus
- Suitable for stable, mature systems

**Implementation**
1. Inventory current infrastructure (CPU, RAM, disk, network)
2. Right-size for Azure VM options
3. Plan storage layout on Premium SSD or ANF
4. Configure high availability (Pacemaker/WSFC)
5. Migrate with ASR or physical-to-virtual (P2V) tools

**Post-Migration Optimization**
- Review and optimize VM sizing
- Implement cost optimization (RIs, AHB)
- Enable monitoring and backup
- Establish disaster recovery procedures

### Application Re-Architecture (Modernization)

**Modernization Opportunities**
- Decompose monolithic systems to microservices
- Leverage Azure PaaS services (Azure SQL, Cosmos DB)
- Implement event-driven architecture
- Cloud-native development patterns

**Risk vs. Benefit Analysis**
- Trade migration timeline for modernization benefits
- Phased approach: migrate core first, modernize incrementally
- Proof-of-concept for new patterns before full commitment

---

## Quick Reference: Common Decision Trees

### VM Sizing Decision

**Q: What is your HANA database size?**
- < 500 GB → E-series (cost-optimized)
- 500 GB - 2 TB → M-series (recommended)
- 2 TB - 5.7 TB → Mv2-series (max memory)

### Architecture Selection

**Q: Do you need to scale database horizontally?**
- NO, < 6 TB → Scale-up (simpler operations)
- YES, > 6 TB OR extreme performance → Scale-out (HSR optional)

### HA/DR Strategy

**Q: What is your RTO/RPO requirement?**
- RTO < 5 min, RPO = 0 → Pacemaker HSR (local HA + regional DR)
- RTO 15-30 min, RPO < 5 min → Pacemaker + ASR or HSR Async
- RTO > 1 hour, RPO acceptable → ASR alone (cost-effective)

### Cost Optimization

**Q: Is this production with stable workload?**
- YES → 3-year RIs (45% savings) + AHB
- NO → Pay-as-you-go + scheduled shutdowns
- Variable → 1-year RIs for baseline + on-demand for peaks

---

## Related Resources & Support

- **SAP Note 2015553**: SAP on Microsoft Azure support matrix
- **SAP Note 1928533**: SAP applications on Azure sizing guidelines
- **Microsoft Learn**: SAP on Azure training paths
- **Azure Well-Architected Framework**: Azure reliability, security, cost optimization
- **Azure Advisor**: Automatic recommendations for cost and performance
- **SAP Early Watch Alert**: Regular health check reports

---

## Getting Help & Collaboration

When discussing SAP on Azure topics with this skill:
- Provide current system details (database size, number of instances, infrastructure)
- Specify existing constraints (network, budget, RTO/RPO)
- Share your deployment topology or architecture diagram
- Discuss your specific challenge or decision needed
- Include relevant Azure region and service tier information

This skill will help you develop architecture recommendations, capacity plans, migration strategies, and optimization roadmaps aligned with enterprise best practices.
