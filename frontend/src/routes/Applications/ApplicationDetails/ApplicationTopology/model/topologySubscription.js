/* Copyright Contributors to the Open Cluster Management project */

import { get, includes, concat, uniqBy, filter, keyBy, cloneDeep, groupBy } from 'lodash'

import { createChildNode, addClusters } from './utils'

const localClusterName = 'local-cluster'

export const getSubscriptionTopology = (application, managedClusters, relatedResources) => {
    const links = []
    const nodes = []
    let name
    let namespace
    ;({ name, namespace } = application)

    // add application node
    const allAppClusters = application.allClusters ? application.allClusters : []
    const appId = `application--${name}`
    nodes.push({
        name: '',
        namespace,
        type: 'application',
        id: appId,
        uid: appId,
        specs: {
            isDesign: true,
            raw: application.app,
            activeChannel: application.activeChannel,
            allSubscriptions: application.allSubscriptions ? application.allSubscriptions : [],
            allChannels: application.allChannels ? application.allChannels : [],
            allClusters: {
                isLocal: allAppClusters.indexOf(localClusterName) !== -1,
                remoteCount:
                    allAppClusters.indexOf('local-cluster') !== -1 ? allAppClusters.length - 1 : allAppClusters.length,
            },
            channels: application.channels,
        },
    })

    // get clusters names
    let managedClusterNames = managedClusters.map((cluster) => {
        return cluster?.metadata?.name
    })
    // if application has subscriptions
    let clusterId
    if (application.subscriptions) {
        application.subscriptions.forEach((subscription) => {
            // get cluster placement if any
            const ruleDecisionMap = {}
            if (subscription.rules) {
                subscription.rules.forEach((rule) => {
                    const ruleDecisions = get(rule, 'status.decisions')
                    if (ruleDecisions) {
                        ruleDecisions.forEach(({ clusterName, clusterNamespace }) => {
                            ruleDecisionMap[clusterName] = clusterNamespace
                        })
                    }
                })
            }
            if (
                get(subscription, 'spec.placement.local', '') === true &&
                subscription.rules &&
                includes(managedClusterNames, localClusterName) === false
            ) {
                const localCluster = {
                    metadata: {
                        name: localClusterName,
                        namespace: localClusterName,
                    },
                }
                managedClusterNames = concat(managedClusterNames, localCluster)
                ruleDecisionMap[localClusterName] = localClusterName
            }
            const ruleClusterNames = Object.keys(ruleDecisionMap)

            // get source
            const ann = get(subscription, 'metadata.annotations', {})
            let source =
                ann['apps.open-cluster-management.io/git-path'] ||
                ann['apps.open-cluster-management.io/github-path'] ||
                ann['apps.open-cluster-management.io/bucket-path'] ||
                get(subscription, 'spec.packageOverrides[0].packageName') ||
                ''
            source = source.split('/').pop()

            // add cluster nodes
            clusterId = addClusters(appId, subscription, source, ruleClusterNames, managedClusterNames, links, nodes)

            const isRulePlaced = ruleClusterNames.length > 0

            // add subscription node
            const subscriptionId = addSubscription(clusterId, subscription, isRulePlaced, links, nodes)

            // add rules node
            if (subscription.rules) {
                addSubscriptionRules(clusterId, subscription, links, nodes)
            }

            // add prehooks
            if (subscription.prehooks && subscription.prehooks.length > 0) {
                addSubscriptionHooks(subscriptionId, subscription, links, nodes, true)
            }
            if (subscription.posthooks && subscription.posthooks.length > 0) {
                addSubscriptionHooks(subscriptionId, subscription, links, nodes, false)
            }

            // add deployed resource nodes using subscription report
            if (subscription.report) {
                processReport(subscription.report, subscriptionId, links, nodes, relatedResources)
            }
        })
    }

    return { nodes: uniqBy(nodes, 'uid'), links }
}

const addSubscription = (appId, subscription, isPlaced, links, nodes) => {
    const {
        metadata: { namespace, name },
    } = subscription
    const subscriptionId = `member--subscription--${namespace}--${name}`
    const rule = get(subscription, 'rules[0]')
    nodes.push({
        name,
        namespace,
        type: 'subscription',
        id: subscriptionId,
        uid: subscriptionId,
        specs: {
            isDesign: true,
            hasRules: !!rule,
            isPlaced,
            raw: subscription,
        },
    })

    links.push({
        from: { uid: appId },
        to: { uid: subscriptionId },
        type: '',
        specs: { isDesign: true },
    })
    return subscriptionId
}

const addSubscriptionRules = (parentId, subscription, links, nodes) => {
    subscription.rules.forEach((rule, idx) => {
        const {
            metadata: { name, namespace },
        } = rule
        const ruleId = `member--rules--${namespace}--${name}--${idx}`
        nodes.push({
            name,
            namespace,
            type: 'placements',
            id: ruleId,
            uid: ruleId,
            specs: { isDesign: true, raw: rule },
        })
        links.push({
            from: { uid: parentId },
            to: { uid: ruleId },
            type: '',
            specs: { isDesign: true },
        })
    })
}

const addSubscriptionHooks = (parentId, subscription, links, nodes, isPreHook) => {
    const hookList = isPreHook ? subscription.prehooks : subscription.posthooks
    hookList.forEach((hook) => {
        const {
            metadata: { name, namespace },
            kind,
        } = hook
        const type = kind.toLowerCase()
        const memberId = `member--deployed-resource--${parentId}--${namespace}--${name}--${type}`
        hook.hookType = isPreHook ? 'pre-hook' : 'post-hook'

        nodes.push({
            name,
            namespace,
            type,
            id: memberId,
            uid: memberId,
            specs: { isDesign: false, raw: hook },
        })
        links.push({
            from: { uid: isPreHook ? memberId : parentId },
            to: { uid: isPreHook ? parentId : memberId },
            type: '',
            specs: { isDesign: false },
        })
    })
}

const processReport = (report, clusterId, links, nodes, relatedResources) => {
    // for each resource, add what it's related to
    report = cloneDeep(report)
    const resources = report.resources || []
    if (relatedResources) {
        resources.forEach((resource) => {
            const { name, namespace } = resource
            resource.template = relatedResources[`${name}-${namespace}`]
        })
    }

    const serviceOwners = filter(resources, (obj) => {
        const kind = get(obj, 'kind', '')
        return includes(['Route', 'Ingress', 'StatefulSet'], kind)
    })

    // process route and service first
    const serviceMap = processServiceOwner(clusterId, serviceOwners, links, nodes, relatedResources)

    const services = filter(resources, (obj) => {
        const kind = get(obj, 'kind', '')
        return includes(['Service'], kind)
    })

    // then service
    processServices(clusterId, services, links, nodes, serviceMap)

    // then the rest
    const others = filter(resources, (obj) => {
        const kind = get(obj, 'kind', '')
        return !includes(['Route', 'Ingress', 'StatefulSet', 'Service'], kind)
    })

    processMultiples(others).forEach((resource) => {
        addSubscriptionDeployedResource(clusterId, resource, links, nodes)
    })
}

const processMultiples = (resources) => {
    if (resources.length > 5) {
        const groupByKind = groupBy(resources, 'kind')
        return Object.entries(groupByKind).map(([kind, _resources]) => {
            return {
                kind,
                name: '',
                namespace: '',
                resources: _resources,
                resourceCount: _resources.length,
            }
        })
    }
    return resources
}

// Route, Ingress, StatefulSet
const processServiceOwner = (clusterId, serviceOwners, links, nodes, relatedResources) => {
    const servicesMap = {}
    serviceOwners.forEach((serviceOwner, inx) => {
        const node = addSubscriptionDeployedResource(clusterId, serviceOwner, links, nodes)

        if (relatedResources) {
            // get service info and map it to the object id
            let service, rules
            const { kind, template } = serviceOwner
            switch (kind) {
                case 'Route':
                    service = get(template, 'template.spec.to.name')
                    if (service) {
                        servicesMap[service] = node.id
                    }
                    break
                case 'Ingress':
                    rules = get(template, 'template.spec.rules', [])
                    rules.forEach((rule) => {
                        const rulePaths = get(rule, 'http.paths', [])
                        rulePaths.forEach((path) => {
                            service = get(path, 'backend.serviceName')
                            if (service) {
                                servicesMap[service] = node.id
                            }
                        })
                    })
                    break
                case 'StatefulSet':
                    service = get(template, 'template.spec.serviceName')
                    if (service) {
                        servicesMap[service] = node.id
                    }
                    break
            }
        } else if (serviceOwners.length === 1) {
            servicesMap[`serviceOwner${inx}`] = node.id
        }
    })
    // return a map of services that must be linked to these router
    return servicesMap
}

const processServices = (clusterId, services, links, nodes, servicesMap) => {
    services.forEach((service, inx) => {
        const serviceName = service.name
        let parentId = servicesMap[serviceName]
        if (!parentId) {
            parentId = servicesMap[`serviceOwner${inx}`]
        }
        if (!parentId) {
            parentId = clusterId
        }

        addSubscriptionDeployedResource(parentId, service, links, nodes)
    })
}

const addSubscriptionDeployedResource = (parentId, resource, links, nodes) => {
    const parentNode = nodes.find((n) => n.id === parentId)
    const parentObject = parentNode
        ? {
              parentId,
              parentName: parentNode.name,
              parentType: parentNode.type,
              parentSpecs: parentNode.specs,
          }
        : undefined

    const { name, namespace, template, resources, resourceCount } = resource
    const kind = resource.kind.toLowerCase()
    const memberId = `member--deployed-resource--${parentId}--${namespace}--${name}--${kind}`

    const node = {
        name: name,
        namespace: namespace,
        type: kind,
        id: memberId,
        uid: memberId,
        specs: {
            parent: parentObject,
            template,
            resources,
            resourceCount,
        },
    }

    nodes.push(node)
    links.push({
        from: { uid: parentId },
        to: { uid: memberId },
        type: '',
    })

    // create replica subobject, if this object defines a replicas
    createReplicaChild(node, template, links, nodes)

    // create controllerrevision subobject, if this object is a daemonset
    createControllerRevisionChild(node, links, nodes)

    // create route subobject, if this object is an ingress
    createIngressRouteChild(node, links, nodes)

    return node
}

export const createReplicaChild = (parentObject, template, links, nodes) => {
    const parentType = get(parentObject, 'type', '')
    if (parentType === 'deploymentconfig' || parentType === 'deployment') {
        const type = parentType === 'deploymentconfig' ? 'replicationcontroller' : 'replicaset'
        if (template && template.related) {
            const relatedMap = keyBy(template.related, 'kind')
            if (relatedMap['replicaset']) {
                const pNode = createChildNode(parentObject, type, links, nodes)
                return createChildNode(pNode, 'pod', links, nodes)
            } else if (relatedMap['pod']) {
                return createChildNode(parentObject, 'pod', links, nodes)
            }
        } else {
            const pNode = createChildNode(parentObject, type, links, nodes)
            if (type === 'replicaset') {
                return createChildNode(pNode, 'pod', links, nodes)
            }
        }
    }
}

const createIngressRouteChild = (parentObject, links, nodes) => {
    const parentType = get(parentObject, 'type', '')
    if (parentType === 'ingress') {
        const type = 'route'
        return createChildNode(parentObject, type, links, nodes)
    }
}

const createControllerRevisionChild = (parentObject, links, nodes) => {
    const parentType = get(parentObject, 'type', '')
    if (parentType === 'daemonset' || parentType === 'statefulset') {
        // create only for daemonset or statefulset types
        return createChildNode(parentObject, 'controllerrevision', links, nodes)
    }
}