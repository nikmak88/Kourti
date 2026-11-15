import { useParams, Link, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useContract, useUpdateContract, useDeleteContract } from '@/hooks/useContracts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { ArrowLeft, Save, FileText, AlertTriangle, Eye, Loader2 } from 'lucide-react';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import { PageContainer } from '@/components/layout/PageContainer';
import { useContractTypeOptions } from '@/hooks/useContractTypes';
import { useTranslation } from 'react-i18next';

export default function ContractEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation('contracts');
  const { data: contract, isLoading } = useContract(id!);
  const updateContract = useUpdateContract();
  const deleteContract = useDeleteContract();
  const [isModified, setIsModified] = useState(false);
  const [activeTab, setActiveTab] = useState('content');

  const [contractData, setContractData] = useState({
    title: '',
    description: '',
    status: 'draft' as string,
    contract_type: '',
    value: 0,
    currency: 'USD',
    start_date: '',
    end_date: '',
    terms: '',
  });
  // Managed in Settings → Contract types; keeps the contract's current type even if retired.
  const { options: contractTypeOptions } = useContractTypeOptions(contractData.contract_type);

  useEffect(() => {
    if (contract) {
      setContractData({
        title: contract.title || '',
        description: contract.description || '',
        status: contract.status || 'draft',
        contract_type: contract.contract_type || '',
        value: contract.value || 0,
        currency: contract.currency || 'USD',
        start_date: contract.start_date || '',
        end_date: contract.end_date || '',
        terms: contract.terms || '',
      });
    }
  }, [contract]);

  if (isLoading) {
    return (
      <PageContainer>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </PageContainer>
    );
  }

  if (!contract) {
    return (
      <PageContainer>
        <Breadcrumbs />
        <Card className="shadow-card">
          <CardContent className="p-12 text-center">
            <FileText className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">{t('edit.notFound.title')}</h3>
            <p className="text-muted-foreground mb-4">
              {t('edit.notFound.description')}
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

  const handleSave = async () => {
    try {
      await updateContract.mutateAsync({
        id: id!,
        ...contractData,
      });
      setIsModified(false);
      navigate(`/contracts/${id}`);
    } catch {
      // Error handled by mutation
    }
  };

  const handleDelete = async () => {
    try {
      await deleteContract.mutateAsync(id!);
      navigate('/contracts');
    } catch {
      // Error handled by mutation
    }
  };

  const handleChange = (field: string, value: unknown) => {
    setContractData((prev) => ({
      ...prev,
      [field]: value,
    }));
    setIsModified(true);
  };

  return (
    <PageContainer>
      <Breadcrumbs />
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link to={`/contracts/${id}`}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t('common:actions.back')}
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
              {t('edit.title')}
            </h1>
            <p className="text-muted-foreground">{contract.title}</p>
          </div>
          {isModified && (
            <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
              <AlertTriangle className="h-3 w-3 mr-1" />
              {t('edit.unsavedChanges')}
            </Badge>
          )}
        </div>

        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to={`/contracts/${id}`}>
              <Eye className="h-4 w-4 mr-2" />
              {t('edit.preview')}
            </Link>
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button disabled={!isModified || updateContract.isPending}>
                <Save className="h-4 w-4 mr-2" />
                {updateContract.isPending
                  ? t('common:status.saving')
                  : t('common:actions.saveChanges')}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('edit.saveDialog.title')}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t('edit.saveDialog.description')}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('common:actions.cancel')}</AlertDialogCancel>
                <AlertDialogAction onClick={handleSave}>
                  {t('common:actions.saveChanges')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList>
          <TabsTrigger value="content">{t('edit.tabs.content')}</TabsTrigger>
          <TabsTrigger value="metadata">{t('edit.tabs.metadata')}</TabsTrigger>
        </TabsList>

        <TabsContent value="content" className="space-y-6">
          <Card className="shadow-card">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{t('edit.contentHeading')}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="contractTitle">{t('create.basic.titleLabel')}</Label>
                <Input
                  id="contractTitle"
                  value={contractData.title}
                  onChange={(e) => handleChange('title', e.target.value)}
                  placeholder={t('edit.titlePlaceholder')}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="contractDescription">{t('common:fields.description')}</Label>
                <Textarea
                  id="contractDescription"
                  value={contractData.description}
                  onChange={(e) => handleChange('description', e.target.value)}
                  className="min-h-[100px]"
                  placeholder={t('edit.descriptionPlaceholder')}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="contractTerms">{t('edit.termsLabel')}</Label>
                <Textarea
                  id="contractTerms"
                  value={contractData.terms}
                  onChange={(e) => handleChange('terms', e.target.value)}
                  className="min-h-[300px] font-mono text-sm"
                  placeholder={t('edit.termsPlaceholder')}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="metadata" className="space-y-6">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>{t('edit.metadataHeading')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t('create.basic.typeLabel')}</Label>
                  <Select
                    value={contractData.contract_type}
                    onValueChange={(value) => handleChange('contract_type', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('edit.typePlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      {contractTypeOptions.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>{t('common:fields.status')}</Label>
                  <Select
                    value={contractData.status}
                    onValueChange={(value) => handleChange('status', value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">{t('status.draft')}</SelectItem>
                      <SelectItem value="active">{t('status.active')}</SelectItem>
                      <SelectItem value="expired">{t('status.expired')}</SelectItem>
                      <SelectItem value="terminated">{t('status.terminated')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>{t('create.basic.valueLabel')}</Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      value={contractData.value}
                      onChange={(e) => handleChange('value', parseFloat(e.target.value) || 0)}
                      placeholder="0"
                    />
                    <Select
                      value={contractData.currency}
                      onValueChange={(value) => handleChange('currency', value)}
                    >
                      <SelectTrigger className="w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="USD">USD</SelectItem>
                        <SelectItem value="EUR">EUR</SelectItem>
                        <SelectItem value="GBP">GBP</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="startDate">{t('create.terms.startDate')}</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={contractData.start_date}
                    onChange={(e) => handleChange('start_date', e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="endDate">{t('common:fields.endDate')}</Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={contractData.end_date}
                    onChange={(e) => handleChange('end_date', e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive">{t('edit.danger.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            {t('edit.danger.description')}
          </p>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">{t('edit.danger.delete')}</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('edit.deleteDialog.title')}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t('edit.deleteDialog.description')}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('common:actions.cancel')}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {t('edit.danger.delete')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
