import { useParams, Link } from 'react-router-dom';
import { useState } from 'react';
import { contractsData } from '@/pages/contractsData';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  ArrowLeft,
  Clock,
  User,
  FileText,
  Download,
  Eye,
  GitBranch,
  Calendar,
  Filter,
  Search,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatDate } from '@/i18n/dates';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import { PageContainer } from '@/components/layout/PageContainer';

interface Version {
  version: number;
  date: string;
  description: string;
  editedBy?: string;
  changes?: string[];
  fileSize?: string;
  status?: string;
}

export default function ContractHistory() {
  const { id } = useParams();
  const { t } = useTranslation('contracts');
  const contract = contractsData.find((c) => c.id === id);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBy, setFilterBy] = useState('all');

  // Enhanced version data with more details
  const enhancedVersions: Version[] = [
    {
      version: 3,
      date: '2024-02-01',
      description: 'Final signed contract with updated payment terms',
      editedBy: 'Sarah Wilson',
      changes: [
        'Updated payment terms from 30 to 45 days',
        'Added early termination clause',
        'Modified intellectual property section',
      ],
      fileSize: '156 KB',
      status: 'Final',
    },
    {
      version: 2,
      date: '2024-01-15',
      description: 'Second draft with client feedback incorporated',
      editedBy: 'Michael Chen',
      changes: [
        'Revised liability clauses',
        'Updated service level agreements',
        'Added compliance requirements',
      ],
      fileSize: '142 KB',
      status: 'Draft',
    },
    {
      version: 1,
      date: '2023-12-01',
      description: 'Initial contract draft',
      editedBy: 'Sarah Wilson',
      changes: [
        'Created initial contract structure',
        'Added standard terms and conditions',
        'Included basic party information',
      ],
      fileSize: '128 KB',
      status: 'Draft',
    },
  ];

  if (!contract) {
    return (
      <PageContainer>
        <Breadcrumbs />
        <Card className="shadow-card">
          <CardContent className="p-12 text-center">
            <FileText className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">{t('edit.notFound.title')}</h3>
            <p className="text-muted-foreground mb-4">
              {t('view.notFoundDescription')}
            </p>
            <Button asChild>
              <Link to="/contracts">
                <ArrowLeft className="h-4 w-4 mr-2" />
                {t('shared.backToContracts')}
              </Link>
            </Button>
          </CardContent>
        </Card>
      </PageContainer>
    );
  }

  const filteredVersions = enhancedVersions.filter((version) => {
    const matchesSearch =
      version.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      version.editedBy?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterBy === 'all' || version.status?.toLowerCase() === filterBy;

    return matchesSearch && matchesFilter;
  });

  const versionStatusLabel = (status: string) =>
    t(`history.versionStatus.${status.toLowerCase()}`, { defaultValue: status });

  const getStatusColor = (status?: string) => {
    switch (status?.toLowerCase()) {
      case 'final':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'draft':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'review':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const handleDownloadVersion = (version: Version) => {
    // Simulate downloading a specific version
    const content = `Contract Version ${version.version}\n\nGenerated on: ${version.date}\nEdited by: ${version.editedBy}\n\n${contract.content}`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${contract.name}_v${version.version}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleRestoreVersion = (version: Version) => {
    contract.content = `Restored to version ${version.version} on ${version.date}\n\n${contract.content}`;
    alert(t('history.restoredAlert', { version: version.version }));
  };

  return (
    <PageContainer>
      <Breadcrumbs />
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link to={`/contracts/${contract.id}`}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                {t('common:actions.back')}
              </Link>
            </Button>
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight flex items-center gap-2">
              <GitBranch className="h-6 w-6 text-muted-foreground" />
              {t('list.actions.history')}
            </h1>
            <p className="text-muted-foreground">{contract.name}</p>
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to={`/contracts/${contract.id}/edit`}>{t('history.editCurrent')}</Link>
          </Button>
          <Button asChild>
            <Link to={`/contracts/${contract.id}`}>
              <Eye className="h-4 w-4 mr-2" />
              {t('list.actions.view')}
            </Link>
          </Button>
        </div>
      </div>

      {/* Filters and Search */}
      <Card className="shadow-card">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t('history.searchPlaceholder')}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Select value={filterBy} onValueChange={setFilterBy}>
                <SelectTrigger className="w-40">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('history.filters.all')}</SelectItem>
                  <SelectItem value="final">{t('history.versionStatus.final')}</SelectItem>
                  <SelectItem value="draft">{t('history.versionStatus.draft')}</SelectItem>
                  <SelectItem value="review">{t('history.versionStatus.review')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Version Timeline */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            {t('history.versionsTitle', { count: filteredVersions.length })}
            <Badge variant="secondary">
              {t('history.current', {
                version: Math.max(...enhancedVersions.map((v) => v.version)),
              })}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {filteredVersions.map((version, index) => (
              <div key={version.version} className="relative">
                {index < filteredVersions.length - 1 && (
                  <div className="absolute left-6 top-12 bottom-0 w-px bg-border"></div>
                )}
                <div className="flex items-start gap-4 p-4 rounded-lg border hover:bg-muted/30 transition-colors">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-medium text-primary">v{version.version}</span>
                  </div>

                  <div className="flex-1 space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-medium">{version.description}</h4>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {formatDate(version.date, 'PP')}
                          </div>
                          {version.editedBy && (
                            <div className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {version.editedBy}
                            </div>
                          )}
                          {version.fileSize && (
                            <div className="flex items-center gap-1">
                              <FileText className="h-3 w-3" />
                              {version.fileSize}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {version.status && (
                          <Badge variant="outline" className={getStatusColor(version.status)}>
                            {versionStatusLabel(version.status)}
                          </Badge>
                        )}
                        <div className="flex gap-1">
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                aria-label={t('history.viewDetails')}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-2xl">
                              <DialogHeader>
                                <DialogTitle>
                                  {t('history.detailsTitle', { version: version.version })}
                                </DialogTitle>
                              </DialogHeader>
                              <div className="space-y-4">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                                  <div>
                                    <strong>{t('history.labels.date')}</strong>{' '}
                                    {formatDate(version.date, 'PPP')}
                                  </div>
                                  <div>
                                    <strong>{t('history.labels.editedBy')}</strong>{' '}
                                    {version.editedBy}
                                  </div>
                                  <div>
                                    <strong>{t('history.labels.status')}</strong>{' '}
                                    {version.status ? versionStatusLabel(version.status) : ''}
                                  </div>
                                  <div>
                                    <strong>{t('history.labels.fileSize')}</strong>{' '}
                                    {version.fileSize}
                                  </div>
                                </div>

                                <div>
                                  <strong className="text-sm">{t('history.labels.description')}</strong>
                                  <p className="text-sm text-muted-foreground mt-1">
                                    {version.description}
                                  </p>
                                </div>

                                {version.changes && version.changes.length > 0 && (
                                  <div>
                                    <strong className="text-sm">{t('history.labels.changes')}</strong>
                                    <ul className="list-disc list-inside text-sm text-muted-foreground mt-1 space-y-1">
                                      {version.changes.map((change, i) => (
                                        <li key={i}>{change}</li>
                                      ))}
                                    </ul>
                                  </div>
                                )}

                                <div className="flex justify-end gap-2 pt-4">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleDownloadVersion(version)}
                                  >
                                    <Download className="h-4 w-4 mr-2" />
                                    {t('common:actions.download')}
                                  </Button>
                                  <Button size="sm" onClick={() => handleRestoreVersion(version)}>
                                    {t('history.restore')}
                                  </Button>
                                </div>
                              </div>
                            </DialogContent>
                          </Dialog>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDownloadVersion(version)}
                            aria-label={t('history.downloadVersion')}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>

                    {version.changes && version.changes.length > 0 && (
                      <div className="text-sm">
                        <p className="text-muted-foreground mb-1">{t('history.keyChanges')}</p>
                        <ul className="text-muted-foreground space-y-1">
                          {version.changes.slice(0, 2).map((change, i) => (
                            <li key={i} className="flex items-center gap-2">
                              <div className="w-1 h-1 bg-muted-foreground rounded-full"></div>
                              {change}
                            </li>
                          ))}
                          {version.changes.length > 2 && (
                            <li className="text-xs text-muted-foreground/70">
                              {t('history.moreChanges', { count: version.changes.length - 2 })}
                            </li>
                          )}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {filteredVersions.length === 0 && (
            <div className="text-center py-12">
              <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">{t('history.empty.title')}</h3>
              <p className="text-muted-foreground">
                {searchTerm || filterBy !== 'all'
                  ? t('history.empty.filtered')
                  : t('history.empty.none')}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Version Comparison */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>{t('history.compare.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-medium">{t('history.compare.from')}</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder={t('history.compare.selectVersion')} />
                </SelectTrigger>
                <SelectContent>
                  {enhancedVersions.map((version) => (
                    <SelectItem key={version.version} value={version.version.toString()}>
                      v{version.version} - {formatDate(version.date, 'P')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-sm font-medium">{t('history.compare.to')}</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder={t('history.compare.selectVersion')} />
                </SelectTrigger>
                <SelectContent>
                  {enhancedVersions.map((version) => (
                    <SelectItem key={version.version} value={version.version.toString()}>
                      v{version.version} - {formatDate(version.date, 'P')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-4">
            <Button variant="outline" className="w-full">
              <GitBranch className="h-4 w-4 mr-2" />
              {t('history.compare.action')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
