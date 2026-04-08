# Port Car Billing System

A comprehensive web application for calculating port authority wharfrent and payable charges for vehicles at the port. This system handles billing for vehicles up to 3 tons with support for both inside and outside port charges, VAT calculations, and split billing for rate changes.

## 🚗 Features

### Core Functionality

- **Wharfrent Calculation**: Automatic calculation based on vehicle weight and storage duration
- **Rate Management**: Support for old and new rate structures with split billing capability
- **Payable Charges**: River dues, landing charges, removal charges, weighment charges, and levy
- **VAT Calculation**: Automatic VAT computation on applicable charges
- **Inside/Outside Billing**: Different rate structures for inside vs outside port charges
- **Weight Validation**: Maximum 3-ton vehicle limit with user warnings

### Billing Rules

1. **Free Time**: CLD + 3 days (4 days total including CLD)
2. **Wharfrent Start**: Day after free time ends
3. **Rate Calculation**: Tk × ton × day (slab-wise)
4. **Split Billing**: For CLD ≤ 22/07/2024 with delivery after rate change
5. **Inside Charges**: Full wharfrent + payable + VAT + levy
6. **Outside Charges**: ½ wharfrent + payable + VAT + levy
7. **Levy**: Added without VAT

### Rate Structure

- **New Rates** (From 23/07/2024):
  - 1st 7 days: 70 Tk/ton/day
  - 8th-14th day: 185 Tk/ton/day
  - 15th day onwards: 295 Tk/ton/day

- **Old Rates** (Up to 22/07/2024):
  - 1st 7 days: 40 Tk/ton/day
  - 8th-14th day: 115 Tk/ton/day
  - 15th day onwards: 185 Tk/ton/day

## 🎨 Design & UI

### Visual Design

- **Dark Theme**: Professional dark interface with gold accent colors
- **Responsive Layout**: Mobile-first design with adaptive breakpoints
- **Typography**: Bebas Neue for headers, DM Mono for data, DM Sans for body
- **Color Coding**:
  - Gold: Primary actions and highlights
  - Blue: Inside port charges
  - Purple: Outside port charges
  - Green: Success states and payable charges
  - Red: Old rates and warnings

### Layout Structure

- **Header**: Logo, admin toggle, user mode indicator
- **Main Content**: Two-column responsive grid
  - Left: Input forms and rate tables
  - Right: Quick preview and billing rules
- **Results Section**: Comprehensive bill statement with statistics
- **Footer**: Copyright information

## 🔐 Security & Access Control

### Admin Mode

- **Authentication**: Username/password system (admin/admin)
- **Field Protection**: Critical fields locked in user mode
- **Rate Editing**: Admin-only access to rate modifications
- **Visual Indicators**: Clear mode badges and status indicators

### Protected Fields (User Mode)

- Free days configuration
- All charge rates (River, Landing, Removal, Weighment, Levy)
- VAT rate
- Wharfrent rate slabs

## 📊 Data Processing

### Calculation Engine

- **Slab-based Billing**: Progressive rate calculation based on storage duration
- **Split Billing Logic**: Automatic handling of rate change transitions
- **Weight Validation**: 1-3 ton range enforcement
- **Date Calculations**: Precise day counting including/excluding boundaries
- **Currency Formatting**: Bangladeshi Taka (Tk) formatting with 2 decimal places

### Input Validation

- Date range validation
- Weight limits (1-3 tons)
- Required field checking
- Real-time preview updates

## 🛠 Technical Architecture

### Frontend Stack

- **HTML5**: Semantic markup with accessibility considerations
- **CSS3**: Custom properties, Grid/Flexbox layouts, animations
- **Vanilla JavaScript**: No external dependencies, pure JS implementation

### Key Components

- **State Management**: Global state for admin mode and calculations
- **Utility Functions**: Date manipulation, formatting, DOM helpers
- **Calculation Engine**: Slab-based billing with split support
- **UI Controller**: Modal management, form interactions, dynamic updates

### Responsive Breakpoints

- **Mobile**: < 360px (compact layout)
- **Tablet**: 360px - 767px (adjusted spacing)
- **Desktop**: 768px - 1023px (two-column layout)
- **Large**: 1024px - 1199px (enhanced spacing)
- **Extra Large**: ≥ 1200px (full layout)

## 📱 Usage Instructions

### Basic Workflow

1. **Enter CLD**: Common Landing Date
2. **Set Weight**: Vehicle weight (1-3 tons)
3. **Select Delivery Date**: When vehicle leaves port
4. **Choose Charges**: Toggle payable charges as needed
5. **Generate Bill**: Click "GENERATE BILL" for full calculation
6. **Review Results**: Check detailed breakdown and totals

### Admin Functions

1. **Login**: Click Admin button, enter credentials
2. **Edit Rates**: Modify charge rates and VAT percentages
3. **Update Wharfrent**: Adjust slab rates as needed
4. **Logout**: Return to user mode when finished

## ⚠️ Limitations & Disclaimers

### System Limitations

- **Weight Cap**: Maximum 3 tons (4+ tons not supported)
- **Currency**: Bangladeshi Taka only
- **Date Range**: No historical limits, but practical date validation
- **Browser**: Modern browsers with ES6+ support required

### Legal Disclaimer

- **Not Official**: This bill cannot be used as an official reference
- **Informational Only**: Provided for estimation purposes
- **Port Authority**: Final billing determined by port authority rates

## 🚀 Deployment

### Requirements

- Modern web browser (Chrome, Firefox, Safari, Edge)
- No server requirements (static HTML file)
- No external dependencies

### Installation

1. Download `index.html` file
2. Open in web browser
3. No additional setup required

### Customization

- **Rates**: Modify default values in HTML input fields
- **Colors**: Adjust CSS custom properties in `:root`
- **Fonts**: Update Google Fonts imports
- **Credentials**: Change admin username/password in JavaScript

## 📝 Development Notes

### Code Structure

- **Modular CSS**: Organized into logical sections
- **Semantic HTML**: Proper heading hierarchy and landmarks
- **Clean JavaScript**: Well-commented, functional programming style
- **Performance**: Optimized DOM manipulation and calculations

### Browser Compatibility

- **Modern Features**: Uses CSS Grid, Custom Properties, ES6+
- **Fallbacks**: Graceful degradation for older browsers
- **Mobile Support**: Touch-friendly interface and responsive design

## 📄 File Structure

```
portbill/
├── index.html          # Main application file
├── README.md          # This documentation
└── assets/            # (optional) Static assets
    └── images/        # Icons and graphics
```

## 🤝 Contributing

### Guidelines

- Maintain existing code style
- Test responsive behavior
- Validate calculations
- Update documentation

### Areas for Enhancement

- Multi-currency support
- Export functionality (PDF/Excel)
- Database integration
- Advanced reporting
- Multi-user support

## 📞 Support

For technical issues or questions:

- Check browser console for errors
- Verify input data validity
- Ensure weight limits are respected
- Review billing rules for understanding

---

**Version**: 1.0.0  
**Last Updated**: 2025  
**Author**: samiulAsumel  
**License**: All Rights Reserved
