import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { EntityService } from '../../../services/EntityService';
import { createCesiumViewer } from '../../../services/globe/CesiumViewerFactory';
import type { CesiumDataSourcesRef, CesiumEntityServiceRef, CesiumHandlerRef, CesiumViewerRef } from './cesiumMapTypes';

interface UseCesiumViewerSetupOptions {
    containerRef: MutableRefObject<HTMLDivElement | null>;
    viewerRef: CesiumViewerRef;
    handlerRef: CesiumHandlerRef;
    dataSourcesRef: CesiumDataSourcesRef;
    entityServiceRef: CesiumEntityServiceRef;
    viewMode: string;
    setViewportCenter: (center: { lat: number; lon: number; alt: number }) => void;
    setSelectedTarget: (target: any) => void;
    setTargetLocked: (locked: boolean) => void;
    setExpandedHubId: Dispatch<SetStateAction<string | null>>;
}

export const useCesiumViewerSetup = ({
    containerRef,
    viewerRef,
    handlerRef,
    dataSourcesRef,
    entityServiceRef,
    viewMode,
    setViewportCenter,
    setSelectedTarget,
    setTargetLocked,
    setExpandedHubId,
}: UseCesiumViewerSetupOptions) => {
    useEffect(() => {
        if (!containerRef.current || viewerRef.current) return;

        let destroyed = false;
        const instance = createCesiumViewer(containerRef.current, viewMode, {
            setViewportCenter, setSelectedTarget, setTargetLocked, setExpandedHubId,
        });

        // Assign refs for sibling hooks
        viewerRef.current = instance.viewer;
        handlerRef.current = instance.handler;
        // Factory returns non-nullable fields; ref type allows null — safe structural assign
        dataSourcesRef.current = instance.dataSources as typeof dataSourcesRef.current;
        entityServiceRef.current = new EntityService(instance.viewer);

        // Async primitive-collection init (code-split)
        import('../../../services/globe/EntityRenderer')
            .then(({ initPrimitiveCollections }) => {
                if (!destroyed) initPrimitiveCollections(instance.viewer);
            })
            .catch((err) => {
                if (!destroyed) console.error('[CesiumMap] Failed to init primitive collections:', err);
            });

        return () => {
            destroyed = true;
            if (entityServiceRef.current) {
                entityServiceRef.current.dispose();
                entityServiceRef.current = null;
            }
            instance.dispose();
            viewerRef.current = null;
            handlerRef.current = null;
        };
    }, []);
};
