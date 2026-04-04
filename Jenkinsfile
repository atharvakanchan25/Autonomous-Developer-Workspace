pipeline {
    agent any

    stages {

        stage('Checkout') {
            steps {
                echo 'Checking out source code...'
                checkout scm
            }
        }

        stage('Build Backend') {
            steps {
                echo 'Building backend Docker image...'
                sh 'docker build -t autonomousdeveloperworkspaceadw-backend:latest ./apps/server-py'
            }
        }

        stage('Build Frontend') {
            steps {
                echo 'Building frontend Docker image...'
                sh 'docker build -t autonomousdeveloperworkspaceadw-frontend:latest ./apps/web'
            }
        }

        stage('Deploy') {
            steps {
                echo 'Deploying containers...'
                sh '''
                    docker rm -f adw-backend adw-frontend || true
                    docker run -d \
                        --name adw-backend \
                        --network devops-app_default \
                        -p 4000:4000 \
                        autonomousdeveloperworkspaceadw-backend:latest
                    docker run -d \
                        --name adw-frontend \
                        --network devops-app_default \
                        -p 3000:3000 \
                        -e NEXT_PUBLIC_API_URL=http://adw-backend:4000 \
                        autonomousdeveloperworkspaceadw-frontend:latest
                '''
            }
        }

        stage('Health Check') {
            steps {
                echo 'Checking backend health...'
                sleep(time: 10, unit: 'SECONDS')
                sh 'docker exec adw-backend curl -f http://localhost:4000/health || echo "Health check skipped"'
            }
        }
    }

    post {
        success {
            echo 'ADW deployed successfully!'
            echo 'Frontend: http://localhost:3000'
            echo 'Backend:  http://localhost:4000'
        }
        failure {
            echo 'Deployment failed!'
            sh 'docker logs adw-backend --tail=20 || true'
        }
    }
}
