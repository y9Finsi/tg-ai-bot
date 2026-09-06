import React from 'react';
import { Button } from './button.jsx';

export class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error("React ErrorBoundary caught error:", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="login-screen">
                    <div className="login-box">
                        <div className="brand-mark">Л</div>
                        <div className="eyebrow">ОШИБКА ИНТЕРФЕЙСА</div>
                        <h1>Не удалось отобразить дневник</h1>
                        <p>{this.state.error?.message || 'Произошла непредвиденная ошибка.'}</p>
                        <Button variant="primary" onClick={() => window.location.reload()}>
                            Перезагрузить страницу
                        </Button>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}

export default ErrorBoundary;
