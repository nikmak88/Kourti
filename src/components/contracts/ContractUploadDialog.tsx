import { useState } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Upload, FileText, X, Loader2 } from 'lucide-react';
import { useCreateContract } from '@/hooks/useContracts';
import { useCases } from '@/hooks/useCases';
import { useClients } from '@/hooks/useClients';
import { toast } from 'sonner';
import { uploadDocument } from '@/lib/fileApi';
import { useUserOrganization } from '@/hooks/useUserOrganization';
import { useContractTypeOptions } from '@/hooks/useContractTypes';
import { useTranslation } from 'react-i18next';

interface ContractUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ContractUploadDialog({ open, onOpenChange }: ContractUploadDialogProps) {
  const { t } = useTranslation('contracts');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [contractData, setContractData] = useState({
    title: '',
    description: '',
    contract_type: '',
    client_id: '',
    case_id: '',
    value: '',
    currency: 'USD',
  });

  const createContract = useCreateContract();
  const { data: casesData } = useCases();
  const { data: clientsData } = useClients();
  const { data: organizationId } = useUserOrganization();

  const cases = Array.isArray(casesData) ? casesData : casesData?.cases || [];
  const clients = Array.isArray(clientsData) ? clientsData : clientsData?.items || [];

  // Managed in Settings → Contract types; value = stored name, label translated.
  const { options: contractTypeOptions } = useContractTypeOptions();

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (acceptedFiles) => {
      if (acceptedFiles.length > 0) {
        const file = acceptedFiles[0];
        setUploadedFile(file);
        if (!contractData.title) {
          setContractData((prev) => ({
            ...prev,
            title: file.name.replace(/\.(pdf|doc|docx)$/i, ''),
          }));
        }

        // Extract text content from file for analysis
        extractTextFromFile(file);
      }
    },
    accept: {
      'application/pdf': ['.pdf'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/plain': ['.txt'],
    },
    maxFiles: 1,
  });

  const extractTextFromFile = async (file: File) => {
    try {
      if (file.type === 'text/plain') {
        const text = await file.text();
        // Could analyze text here to auto-fill contract details
        // For PDF and DOC files, you would need additional libraries
        void text; // Text extraction for analysis (currently unused)
      }
      // For now, we'll just store the file for upload
    } catch {
      // Text extraction failed silently - file will still be uploaded
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!uploadedFile) {
      toast.error(t('common:toast.error'), {
        description: t('upload.errors.noFile'),
      });
      return;
    }

    if (!contractData.title || !contractData.contract_type) {
      toast.error(t('common:toast.error'), {
        description: t('upload.errors.titleAndType'),
      });
      return;
    }

    if (!organizationId) {
      toast.error(t('common:toast.error'), {
        description: t('upload.errors.noOrganization'),
      });
      return;
    }

    setIsUploading(true);

    try {
      // Validate file before upload
      const { validateFile, MAX_CONTRACT_FILE_SIZE } = await import('@/lib/fileValidation');
      const validation = validateFile(uploadedFile, { maxSize: MAX_CONTRACT_FILE_SIZE });
      if (!validation.valid) {
        throw new Error(validation.error || t('upload.errors.validationFailed'));
      }

      // Upload file to storage via Node backend
      const uploadResult = await uploadDocument(uploadedFile);
      const fileName = uploadResult.filePath;

      // Extract text content for searchability
      let extractedText = '';
      if (uploadedFile.type === 'text/plain') {
        extractedText = await uploadedFile.text();
      }

      // Create contract with file path
      const contractPayload = {
        title: contractData.title,
        description: contractData.description,
        contract_type: contractData.contract_type,
        client_id: contractData.client_id || undefined,
        case_id: contractData.case_id || undefined,
        value: contractData.value ? parseFloat(contractData.value) : undefined,
        currency: contractData.currency,
        status: 'draft',
        terms:
          extractedText ||
          `Contract document uploaded: ${uploadedFile.name}\n\nFile path: ${fileName}`,
      };

      await createContract.mutateAsync(contractPayload);

      toast.success(t('common:toast.success'), {
        description: t('toast.uploaded'),
      });

      // Reset form
      setUploadedFile(null);
      setContractData({
        title: '',
        description: '',
        contract_type: '',
        client_id: '',
        case_id: '',
        value: '',
        currency: 'USD',
      });

      onOpenChange(false);
    } catch (error) {
      console.error('Upload error:', error);
      toast.error(t('common:toast.error'), {
        description: error instanceof Error ? error.message : t('toast.uploadFailed'),
      });
    } finally {
      setIsUploading(false);
    }
  };

  const removeFile = () => {
    setUploadedFile(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>{t('upload.title')}</DialogTitle>
          <DialogDescription>
            {t('upload.description')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* File Upload */}
          <div className="space-y-4">
            <Label>{t('upload.fileLabel')}</Label>
            {!uploadedFile ? (
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                  isDragActive
                    ? 'border-primary bg-primary/10'
                    : 'border-muted-foreground/25 hover:border-primary/50'
                }`}
              >
                <input {...getInputProps()} />
                <Upload className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <div className="space-y-2">
                  <p className="text-lg font-medium">
                    {isDragActive ? t('upload.dropHere') : t('upload.dropzoneTitle')}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t('upload.dropzoneHint')}
                  </p>
                </div>
              </div>
            ) : (
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <FileText className="h-10 w-10 text-primary" />
                      <div>
                        <p className="font-medium">{uploadedFile.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {(uploadedFile.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={removeFile}
                      aria-label={t('upload.removeFile')}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Contract Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="title">{t('create.basic.titleLabel')} *</Label>
              <Input
                id="title"
                value={contractData.title}
                onChange={(e) => setContractData({ ...contractData, title: e.target.value })}
                placeholder={t('edit.titlePlaceholder')}
                required
              />
            </div>

            <div className="space-y-2">
              <Label>{t('create.basic.typeLabel')} *</Label>
              <Select
                value={contractData.contract_type}
                onValueChange={(value) =>
                  setContractData({ ...contractData, contract_type: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('upload.typePlaceholder')} />
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
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">{t('common:fields.description')}</Label>
            <Textarea
              id="description"
              value={contractData.description}
              onChange={(e) => setContractData({ ...contractData, description: e.target.value })}
              placeholder={t('upload.descriptionPlaceholder')}
              rows={3}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t('upload.clientLabel')}</Label>
              <Select
                value={contractData.client_id || 'none'}
                onValueChange={(value) =>
                  setContractData({ ...contractData, client_id: value === 'none' ? '' : value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('upload.clientPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('list.noClient')}</SelectItem>
                  {clients.map((client: { id: string; name: string }) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t('upload.caseLabel')}</Label>
              <Select
                value={contractData.case_id || 'none'}
                onValueChange={(value) =>
                  setContractData({ ...contractData, case_id: value === 'none' ? '' : value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('upload.casePlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('upload.noCase')}</SelectItem>
                  {cases.map((case_: { id: string; title: string }) => (
                    <SelectItem key={case_.id} value={case_.id}>
                      {case_.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="value">{t('create.basic.valueLabel')}</Label>
              <Input
                id="value"
                type="number"
                step="0.01"
                value={contractData.value}
                onChange={(e) => setContractData({ ...contractData, value: e.target.value })}
                placeholder="0.00"
              />
            </div>

            <div className="space-y-2">
              <Label>{t('create.basic.currencyLabel')}</Label>
              <Select
                value={contractData.currency}
                onValueChange={(value) => setContractData({ ...contractData, currency: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">{t('upload.currencies.USD')}</SelectItem>
                  <SelectItem value="EUR">{t('upload.currencies.EUR')}</SelectItem>
                  <SelectItem value="GBP">{t('upload.currencies.GBP')}</SelectItem>
                  <SelectItem value="CAD">{t('upload.currencies.CAD')}</SelectItem>
                  <SelectItem value="AUD">{t('upload.currencies.AUD')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end space-x-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common:actions.cancel')}
            </Button>
            <Button type="submit" disabled={isUploading || !uploadedFile}>
              {isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('upload.uploading')}
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  {t('upload.submit')}
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
