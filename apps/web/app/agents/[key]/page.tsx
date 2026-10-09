'use client';

import { use } from 'react';
import { CatalogDetail } from '@/components/catalog/catalog-pages';

export default function Page({ params }: { params: Promise<{ key: string }> }) {
  const { key } = use(params);
  return <CatalogDetail kind="agent" entityKey={decodeURIComponent(key)} />;
}
