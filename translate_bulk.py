import os

FILE_PATH = r"C:\Users\USER\.gemini\antigravity\scratch\omcs\frontend\src\app\products\page.tsx"

with open(FILE_PATH, 'r', encoding='utf-8') as f:
    content = f.read()

replacements = {
    "🏭 Bulk Variant Generator": "🏭 مولد المتغيرات المجمعة",
    "👆 Quick Pick": "👆 اختيار سريع",
    "🔢 Matrix": "🔢 مصفوفة",
    "📏 Range": "📏 نطاق",
    "📋 Paste": "📋 لصق",
    "Pick a category, then click sizes to select. Each selected size creates a variant.": "اختر فئة، ثم انقر على المقاسات ليتم تحديدها. كل مقاس يمثل متغير مستقل.",
    "Colors (optional)": "الألوان (اختياري)",
    "✅ All": "✅ الكل",
    "✕ Clear": "✕ مسح",
    "Selected: <strong": "المحدد: <strong",
    "color(s)": "لون/ألوان",
    "variants<": "متغير<",
    "⚡ Generate ": "⚡ توليد ",
    "⚡ Generate Variants": "⚡ توليد المتغيرات",
    "Enter sizes and colors separated by commas or spaces. Each Size × Color combination creates a variant.": "أدخل المقاسات والألوان مفصولة بفواصل أو مسافات. التقاطع بين المقاس واللون ينشئ متغيراً.",
    "Sizes *": "المقاسات *",
    "Generate sizes from a numeric range.": "توليد المقاسات من خلال نطاق أرقام.",
    "<label className=\"form-label\">From</label>": "<label className=\"form-label\">من</label>",
    "<label className=\"form-label\">To</label>": "<label className=\"form-label\">إلى</label>",
    "<label className=\"form-label\">Step</label>": "<label className=\"form-label\">الخطوة</label>",
    "Paste one variant per line: <code>size, color</code> or <code>size</code> only. Tab or comma separated.": "الصق متغيراً واحداً في كل سطر: <code>المقاس، اللون</code> أو <code>المقاس</code> فقط. استخدم فواصل أو Tab.",
    "💵 Cost USD": "💵 التكلفة بالدولار",
    "💰 Sell USD": "💰 البيع بالدولار",
    "⚡ Apply to All Variants": "⚡ تطبيق على كل المتغيرات",
    "💱 Rate: ": "💱 سعر الصرف: ",
    "Cost: <strong>": "التكلفة: <strong>",
    "Sale: <strong>": "سعر البيع: <strong>",
    "Profit: +$": "الربح: +$",
    "📅 Purchase Date": "📅 تاريخ الشراء",
    "💱 USD Rate at Purchase": "💱 سعر صرف الدولار للشراء",
    "📍 Initial Stock Branch": "📍 الفرع للمخزون المبدئي",
    "Product won't appear in inventory until stocked": "لن يظهر المنتج في المخزون في حال لم تختر الفرع",
    "✅ Inventory rows (qty=0) will be created": "✅ سيتم إنشاء صفوف في المخزون بقيمة 0",
    "📋 Generated Variants (": "📋 المتغيرات المولدة (",
    ">Cancel<": ">إلغاء<",
    "✅ Create Product (": "✅ إنشاء المنتج (",
    ">Creating...<": ">جاري الإنشاء...<",
    "e.g. Nike Air Max 90": "مثال: هاتف آيفون 13",
    "e.g. Nike": "مثال: أبل",
    "Brand<": "الماركة<" 
}

for old, new in replacements.items():
    content = content.replace(old, new)

with open(FILE_PATH, 'w', encoding='utf-8') as f:
    f.write(content)

print("Translation applied successfully.")
