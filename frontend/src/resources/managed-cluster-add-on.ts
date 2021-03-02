/* Copyright Contributors to the Open Cluster Management project */

import { V1ObjectMeta } from '@kubernetes/client-node'
import { listNamespacedResources } from '../lib/resource-request'
import { IResource, IResourceDefinition } from './resource'

export const ManagedClusterAddOnApiVersion = 'addon.open-cluster-management.io/v1alpha1'
export type ManagedClusterAddOnApiVersionType = 'addon.open-cluster-management.io/v1alpha1'

export const ManagedClusterAddOnKind = 'ManagedClusterAddOn'
export type ManagedClusterAddOnKindType = 'ManagedClusterAddOn'

export const ManagedClusterAddOnDefinition: IResourceDefinition = {
    apiVersion: ManagedClusterAddOnApiVersion,
    kind: ManagedClusterAddOnKind,
}

export interface ManagedClusterAddOn extends IResource {
    apiVersion: ManagedClusterAddOnApiVersionType
    kind: ManagedClusterAddOnKindType
    metadata: V1ObjectMeta
    spec: Record<string, unknown>
    status?: {
        conditions: {
            lastTransitionTime: string
            message: string
            reason: string
            status: string
            type: string
        }[]
        addOnMeta: {
            displayName: string
            description: string
        }
        addOnConfiguration: {
            crdName: string
            crName: string
        }
    }
}

export function listManagedClusterAddOns(namespace: string) {
    return listNamespacedResources<ManagedClusterAddOn>({
        apiVersion: ManagedClusterAddOnApiVersion,
        kind: ManagedClusterAddOnKind,
        metadata: { namespace },
    })
}
