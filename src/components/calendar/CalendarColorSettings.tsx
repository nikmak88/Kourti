import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2, Palette } from 'lucide-react';
import { toast } from 'sonner';
import { getSession } from '@/lib/authClient';
import { invokeNodeApi } from '@/lib/backendApi';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

const CALENDAR_COLORS = [
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Red', value: '#ef4444' },
  { name: 'Green', value: '#22c55e' },
  { name: 'Yellow', value: '#eab308' },
  { name: 'Purple', value: '#a855f7' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Cyan', value: '#06b6d4' },
  { name: 'Indigo', value: '#6366f1' },
  { name: 'Teal', value: '#14b8a6' },
  { name: 'Lime', value: '#84cc16' },
  { name: 'Rose', value: '#f43f5e' },
];

export function CalendarColorSettings() {
  const [selectedColor, setSelectedColor] = useState<string>('#3b82f6');
  const [isLoading, setIsLoading] = useState(false);
  const queryClient = useQueryClient();
  const { t } = useTranslation('calendar');

  const handleSave = async () => {
    setIsLoading(true);
    try {
      const user = getSession()?.user;
      if (!user) throw new Error('Not authenticated');

      await invokeNodeApi('/api/v1/profile', {
        method: 'PATCH',
        body: { calendar_color: selectedColor },
      });

      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ['shared-calendars'] });
      queryClient.invalidateQueries({ queryKey: ['calendar-viewers'] });
      queryClient.invalidateQueries({ queryKey: ['organization-members'] });

      toast.success(t('common:toast.success'), {
        description: t('colorSettings.toast.updated'),
      });
    } catch (error: unknown) {
      toast.error(t('common:toast.error'), {
        description: error instanceof Error ? error.message : t('colorSettings.toast.updateFailed'),
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Palette className="h-5 w-5 text-primary" />
          {t('colorSettings.title')}
        </CardTitle>
        <CardDescription>
          {t('colorSettings.description')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>{t('colorSettings.selectColor')}</Label>
          <div className="grid grid-cols-6 gap-3">
            {CALENDAR_COLORS.map((color) => (
              <button
                key={color.value}
                onClick={() => setSelectedColor(color.value)}
                className={`w-12 h-12 rounded-full border-2 transition-all hover:scale-110 ${
                  selectedColor === color.value
                    ? 'border-foreground ring-2 ring-primary ring-offset-2'
                    : 'border-transparent'
                }`}
                style={{ backgroundColor: color.value }}
                title={t(`colorSettings.colors.${color.name.toLowerCase()}`, { defaultValue: color.name })}
              />
            ))}
          </div>
        </div>

        <div className="flex items-center gap-4 pt-2">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{t('colorSettings.preview')}</span>
            <div
              className="w-6 h-6 rounded-full border"
              style={{ backgroundColor: selectedColor }}
            />
          </div>
          <Button onClick={handleSave} disabled={isLoading} className="ml-auto">
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {t('common:status.saving')}
              </>
            ) : (
              t('colorSettings.save')
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
