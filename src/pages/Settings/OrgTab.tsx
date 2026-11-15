
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useCurrentUserOrganization } from "@/hooks/useOrganization";
import { formatDate } from "@/i18n/dates";

export default function OrgTab() {
  const { data: organization, isLoading } = useCurrentUserOrganization();
  const { t } = useTranslation('settings');

  if (isLoading) {
    return <div>{t('common:status.loading')}</div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('org.title')}</CardTitle>
          <CardDescription>
            {t('org.description')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">{t('org.name')}</label>
              <p className="text-sm text-muted-foreground">{organization?.name || t('org.notSet')}</p>
            </div>
            <div>
              <label className="text-sm font-medium">{t('org.industry')}</label>
              <p className="text-sm text-muted-foreground">{/* organization?.industry || */ t('org.notSpecified')}</p>
            </div>
            <div>
              <label className="text-sm font-medium">{t('common:fields.createdAt')}</label>
              <p className="text-sm text-muted-foreground">
                {organization?.created_at ? formatDate(organization.created_at, 'PP') : t('common:status.unknown')}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
