/* Copyright Contributors to the Open Cluster Management project */
/* istanbul ignore file */

import { lazy } from 'react'
import { Redirect, Route, Switch } from 'react-router-dom'
import { RecoilRoot } from 'recoil'
import { LoadData } from './atoms'
import { AppContextContainer } from './components/AppContext'
import './lib/i18n'
import { NavigationPath } from './NavigationPath'

const ClusterManagementPage = lazy(() => import('./routes/ClusterManagement/ClusterManagement'))
const ClusterDetailsPage = lazy(() => import('./routes/ClusterManagement/Clusters/ClusterDetails/ClusterDetails'))
const CreateClusterPage = lazy(() => import('./routes/ClusterManagement/Clusters/CreateCluster/CreateCluster'))
const ImportClusterPage = lazy(() => import('./routes/ClusterManagement/Clusters/ImportCluster/ImportCluster'))
const AddConnectionPage = lazy(() => import('./routes/Credentials/AddCredentials/AddConnection'))
const CreateBareMetalAssetPage = lazy(() => import('./routes/BareMetalAssets/CreateBareMetalAsset'))
const DiscoveryConfig = lazy(() => import('./routes/Discovery/DiscoveryConfig/DiscoveryConfig'))
const CredentialsPage = lazy(() => import('./routes/Credentials/Credentials'))

export default function App() {
    return (
        <RecoilRoot>
            <LoadData>
                <AppContextContainer>
                    <Switch>
                        <Route path={NavigationPath.clusterDetails} component={ClusterDetailsPage} />
                        <Route exact path={NavigationPath.createCluster} component={CreateClusterPage} />
                        <Route exact path={NavigationPath.importCluster} component={ImportClusterPage} />
                        <Route exact path={NavigationPath.credentials} component={CredentialsPage} />
                        <Route exact path={NavigationPath.addCredentials} component={AddConnectionPage} />
                        <Route exact path={NavigationPath.editCredentials} component={AddConnectionPage} />
                        <Route exact path={NavigationPath.editBareMetalAsset} component={CreateBareMetalAssetPage} />
                        <Route exact path={NavigationPath.createBareMetalAsset} component={CreateBareMetalAssetPage} />
                        <Route exact path={NavigationPath.discoveryConfig} component={DiscoveryConfig} />
                        <Route path={NavigationPath.console} component={ClusterManagementPage} />
                        <Route exact path="*">
                            <Redirect to={NavigationPath.console} />
                        </Route>
                    </Switch>
                </AppContextContainer>
            </LoadData>
        </RecoilRoot>
    )
}
